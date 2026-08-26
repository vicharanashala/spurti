#!/bin/bash
# sp-refresh.sh — sakshi-side Spurti SP refresh.
#
# Re-scores SP from the sakshi_spurti mirrors and then refreshes the derived
# Levels / Trophy-League / Legend fields, so any new SP change is picked up and
# shown to students. Owned by sakshi (see memory: spurti-scoring-ownership).
#
# Steps (step 2 only runs if step 1 succeeds):
#   1. pipeline/sp-rubric-build-mirror.cjs  APPLY=1  (auto-backs-up sptransactions
#      + students into sp-runs/ before writing)
#   2. sync-levels.cjs                       (idempotent, derived-only)
#
# The /spurti app reads sakshi_spurti live, so students see the new numbers
# immediately; the samagama-side `updatespurti` cron carries them into chatengine
# on its next even-hour run. No app restart needed.
#
# Self-flocking (single instance) so manual runs and cron can't overlap.
# Scheduled from the sakshi crontab at 06:00/12:00/18:00/00:00 UTC
# = 11:30 / 17:30 / 23:30 / 05:30 IST (every 6h, anchored on 11:30 IST).
set -euo pipefail

REPO=/home/sakshi/spurti
OUT_DIR="$REPO/sp-runs"
LOG="$REPO/logs/sp-refresh.log"
NODE=/usr/bin/node

cd "$REPO"
mkdir -p "$OUT_DIR" "$REPO/logs"

# Single-instance guard: re-exec under an exclusive lock on our own fd.
exec 9>"/tmp/sp-refresh.lock"
if ! flock -n 9; then
  echo "[$(date -u +%FT%TZ)] another sp-refresh is running; skipping" >> "$LOG"
  exit 0
fi

log() { echo "[$(date -u +%FT%TZ)] $*" >> "$LOG"; }

# ── Step runner with failure tracking ────────────────────────────────────────
# sync-attendance-records failed 31 runs in a row over eight days without anyone
# noticing: it is non-fatal by design (a display collection must not block SP
# scoring), and a single "FAILED (non-fatal)" line in a 4,700-line log is
# invisible. Each step's outcome is now recorded, consecutive failures counted,
# and a step that fails twice running shouts in the log AND shows up on the
# admin dashboard, which is somewhere a human actually looks.
HEALTH="$REPO/logs/step-health.tsv"      # name \t status \t lastRun \t consecFails \t lastOk
ALERT_AFTER=2
touch "$HEALTH"

# Where an alert actually goes. The box has no MTA, no local SMTP and no mail
# credentials, so nothing can be posted from here directly. ALERT_WEBHOOK_URL
# (in .env) is POSTed a small JSON body instead; a Google Apps Script web app is
# the intended target, since this project already uses one for the survey sheet
# sync and an Apps Script sends mail AS the owner — no password ever lands on
# the server. Slack/Discord webhooks work too. Unset = log only, no error.
# Read ONLY the alert keys out of .env. Deliberately not `set -a; . .env` —
# that would export every secret in the file into every child process for the
# rest of the run, to configure one webhook.
# `|| true` is load-bearing: this script runs under `set -euo pipefail`, and a
# grep that matches nothing exits 1. Without it, an ABSENT optional key aborts
# the whole refresh before it logs anything — which is exactly what happened to
# the 12:00 run on 2026-08-12: lock file and step-health.tsv created, not one
# line written, no SP rescored, and no error anywhere to explain it.
_envget() { grep -E "^$1=" "$REPO/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'\r" || true; }
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-$(_envget ALERT_WEBHOOK_URL)}"
ALERT_WEBHOOK_SECRET="${ALERT_WEBHOOK_SECRET:-$(_envget ALERT_WEBHOOK_SECRET)}"

notify() {
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  local payload
  # JSON built by node, not by sed — shell quoting is not a serialiser. The
  # secret goes via the environment so it stays out of the process list.
  payload=$(ALERT_TEXT="$1" ALERT_HOST="$(hostname)" ALERT_SECRET="$ALERT_WEBHOOK_SECRET" \
    "$NODE" -e 'process.stdout.write(JSON.stringify({
      secret: process.env.ALERT_SECRET || "",
      host: process.env.ALERT_HOST || "",
      text: process.env.ALERT_TEXT || ""
    }))' 2>/dev/null) || return 0
  # Best effort and short-fused: the alerting channel must never be the reason a
  # scoring run hangs or fails.
  curl -fsS -m 15 -X POST "$ALERT_WEBHOOK_URL" \
       -H 'Content-Type: application/json' --data "$payload" >/dev/null 2>&1 \
    || log "(alert webhook POST failed — the alert is still in this log)"
}

# Rewrite one step's row in the health file, leaving the others untouched.
# awk reads from /dev/null as well as the file: with an unset or empty filename
# awk falls back to STDIN and blocks forever, which would hang the whole refresh
# rather than fail it.
_health_set() {
  local name="$1" status="$2" fails="$3" lastok="$4" tmp
  tmp=$(mktemp)
  awk -F'\t' -v n="$name" '$1!=n' "$HEALTH" > "$tmp" 2>/dev/null </dev/null || true
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$status" "$(date -u +%FT%TZ)" "$fails" "$lastok" >> "$tmp"
  mv "$tmp" "$HEALTH"
}

# run_step <name> <fatal|nonfatal> <note-on-failure> <command...>
run_step() {
  local name="$1" mode="$2" note="$3"; shift 3
  local prev fails lastok
  prev=$(awk -F'\t' -v n="$name" '$1==n{print $4"|"$5}' "$HEALTH" 2>/dev/null </dev/null)
  fails=${prev%%|*}; lastok=${prev#*|}
  [ -n "$fails" ] || fails=0
  [ "$fails" = "$prev" ] && lastok=""

  if "$@" >> "$LOG" 2>&1; then
    log "$name ok"
    _health_set "$name" ok 0 "$(date -u +%FT%TZ)"
    return 0
  fi

  fails=$((fails + 1))
  _health_set "$name" failed "$fails" "$lastok"
  if [ "$fails" -ge "$ALERT_AFTER" ]; then
    local msg="ALERT: sp-refresh step '$name' has FAILED $fails runs in a row (last ok: ${lastok:-never}). $note"
    log "!!! $msg"
    notify "$msg"
  else
    log "$name FAILED — $note"
  fi
  if [ "$mode" = fatal ]; then
    log "$name is fatal — aborting this run"
    exit 1
  fi
  return 1
}

log "=== sp-refresh start ==="

# Load guard: the APPLY rewrites ~90k sptransactions; doing that under heavy load
# has OOM-crashed mongod (2026-08-04). Wait for the 1-min load to drop below
# MAX_LOAD; if it stays high for ~30 min, skip this cycle (the next cron retries).
# Override with FORCE=1 for an urgent manual run.
MAX_LOAD="${MAX_LOAD:-12}"
if [ "${FORCE:-0}" != "1" ]; then
  waited=0
  while :; do
    load1=$(awk '{print int($1)}' /proc/loadavg)
    if [ "$load1" -lt "$MAX_LOAD" ]; then break; fi
    if [ "$waited" -ge 1800 ]; then
      log "load ${load1} >= ${MAX_LOAD} for 30 min; SKIPPING this cycle (next cron retries)"
      exit 0
    fi
    log "load ${load1} >= ${MAX_LOAD}; waiting 60s (waited ${waited}s)"
    sleep 60; waited=$((waited+60))
  done
fi

# Step 0: pull the latest Spandan evening-poll sessions (incremental). Non-fatal:
# if the API is down we still re-score with whatever is already mirrored.
run_step "spandan fetch" nonfatal "scoring with existing spandan_polls" \
  "$NODE" pipeline/spandan-poll-fetch.cjs || true

# Step 1: re-score (APPLY). Backs up before writing.
run_step "rubric APPLY" fatal "SP ledger untouched on failure" \
  env APPLY=1 OUT_DIR="$OUT_DIR" "$NODE" --max-old-space-size=2048 pipeline/sp-rubric-build-mirror.cjs

# Step 2: refresh derived Levels / Trophy League / Legend fields.
run_step "sync-levels" fatal "SP applied but derived level fields may be stale" \
  "$NODE" sync-levels.cjs

# Step 2b: fold attendance minutes into attendancerecords (drives the My-Journey
# 3600-minute standup goal). Parses "present X of Y min (Z%)" from the attendance
# transactions the rubric just wrote. Non-fatal — SP is unaffected if this fails.
run_step "sync-attendance-records" nonfatal "attendance minutes/3600 goal may be stale" \
  "$NODE" pipeline/sync-attendance-records.cjs || true

# Step 3: rebuild the SP-trajectory snapshot (cohort/group reference lines for the
# student trajectory modal). Non-fatal — the student's own line is always live.
run_step "trajectory snapshot" nonfatal "cohort lines may be stale" \
  "$NODE" server/scripts/buildTrajectories.js || true

# Step 3b: rebuild cached leaderboard boards (weekly/all-time/category/cohort).
run_step "leaderboards" nonfatal "boards may be stale" \
  "$NODE" server/scripts/buildLeaderboards.js || true

# Housekeeping: weekly retention — keep last 2 days of dailies + 1 snapshot/week for 12 weeks.
OUT_DIR="$OUT_DIR" WEEKS=12 DAILY_DAYS=2 "$REPO/sp-runs-retention.sh" >> "$LOG" 2>&1 || true

log "=== sp-refresh done ==="
