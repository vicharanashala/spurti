#!/bin/bash
# sp-pipeline.sh â€” daily Spurti pipeline, fired 05:45 UTC (11:15 IST) by
# /etc/cron.d/sp-pipeline, right after the 09:00-11:00 IST mandatory session.
#
# >>> RETIRED SCORING ORCHESTRATOR (since 2026-06-28) <<<
# SCORING MOVED TO THE SAKSHI SIDE. Stage 2 uses the retired live-API
# sp-rubric-build.js, which caused the 2026-06-27 regression and is no longer
# authoritative. DO NOT run/enable stage 2; SP is scored by the sakshi-side
# sp-rubric-build-mirror.cjs via ~/spurti/sp-refresh.sh (root of this repo).
# This file is kept as provenance. Samagama's only remaining job is feeding the
# mirrors (stage 1 #zoomupdate + sync-collaborator-mirrors in cron-sakshi-zoom.sh).
#
# Stages (historical):
#   1. #zoomupdate            zoom-update.js â€” ingest today's Zoom attendance +
#                             polls into zoom_data, then mirror to
#                             sakshi_spurti.zoom_*  (2GB heap: 7-day window can OOM)
#   2. sp-rubric-build APPLY  RETIRED scorer (see above). Do not run.
#   3. sync-spurti-from-sakshi mirror sakshi_spurti SP into chatengine
#                             (spledgers + User.spPoints) so /spurti reflects it
#   4. sync-attendance-records sync sakshi_spurti.attendancerecords from
#                             sptransactions (NOTE: the current script is
#                             sync-attendance-records.cjs, run from Sakshi's
#                             ~/spurti â€” NOT from this samagama dir)
#   5. sync-poll-records      same caveat: the current script is
#                             sync-poll-records.cjs (sakshi side), not here
#   6. zoom-fetch-transcripts fetch AI Companion summaries into zoom_data.summaries
#                             (non-fatal: summary may still be processing at 11:15;
#                              today's meeting is retried on next run)
#   7. (transcript ingest is now chained inside zoom-update.js itself â€” no separate stage)
#
# Fail-fast: each stage must exit 0 before the next runs. Single-instance via
# flock in the cron line. Added 2026-06-04.
set -u
cd /var/samagama/server || exit 1
NODE=/usr/bin/node
HEAP="--max-old-space-size=2048"
ts(){ date -u '+%Y-%m-%dT%H:%M:%SZ'; }

echo "######## $(ts) sp-pipeline start ########"

echo "=== $(ts) STAGE 1/3: #zoomupdate (ingest + sakshi mirror) ==="
$NODE $HEAP zoom-update.js
rc=$?; echo "--- $(ts) stage1 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: #zoomupdate failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 2/3: sp-rubric-build APPLY=1 (RETIRED â€” must not run) ==="
# Scoring moved to the sakshi side (2026-06-28): sp-rubric-build.js is the retired
# live-API scorer. Refuse to APPLY it here; the authoritative run is
# sp-rubric-build-mirror.cjs via ~/spurti/sp-refresh.sh. Unset SKIP_RETIRED_APPLY
# to bypass this guard ONLY if you explicitly intend to re-test the old scorer.
if [ "${SKIP_RETIRED_APPLY:-0}" != "1" ]; then
  echo "ABORT: sp-rubric-build.js is RETIRED. SP is scored by sp-rubric-build-mirror.cjs on the sakshi side. Skipping." >&2
  echo "Set SKIP_RETIRED_APPLY=1 to force (only if you know what you're doing)."
  exit 1
fi
APPLY=1 OUT_DIR=/var/samagama/server/sp-runs $NODE $HEAP sp-rubric-build.js
rc=$?; echo "--- $(ts) stage2 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sp-rubric-build failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 3/3: sync-spurti-from-sakshi (-> chatengine) ==="
$NODE sync-spurti-from-sakshi.js
rc=$?; echo "--- $(ts) stage3 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: spurti mirror failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 4/5: sync-attendance-records (owned by SAKSHI; skip here) ==="
# The current attendance-records rebuild is sync-attendance-records.cjs, run from
# Sakshi's repo (cd ~/spurti) by sp-refresh.sh â€” this samagama stage is the OLD
# .js and no longer runs here. Skipped unless FORCE_RETIRED_STAGES=1.
if [ "${FORCE_RETIRED_STAGES:-0}" = "1" ]; then
  $NODE sync-attendance-records.js
  rc=$?; [ $rc -eq 0 ] || { echo "ABORT: sync-attendance-records failed (rc=$rc)"; exit 1; }
else
  echo "skipped: sync-attendance-records is Sakshi's job via sp-refresh.sh"
fi

echo "=== $(ts) STAGE 5/6: sync-poll-records (owned by SAKSHI; skip here) ==="
# Same as stage 4 â€” the current rebuild is sync-poll-records.cjs from Sakshi's
# repo; nothing here writes pollrecords anymore.
if [ "${FORCE_RETIRED_STAGES:-0}" = "1" ]; then
  $NODE sync-poll-records.js
  rc=$?; [ $rc -eq 0 ] || { echo "ABORT: sync-poll-records failed (rc=$rc)"; exit 1; }
else
  echo "skipped: sync-poll-records is Sakshi's job via sp-refresh.sh"
fi

echo "=== $(ts) STAGE 6/6: zoom-fetch-transcripts (AI summaries -> zoom_data.summaries) ==="
$NODE /home/samagama/samagama/server/zoom-fetch-transcripts.js
rc=$?; echo "--- $(ts) stage6 exit=$rc ---"
# Non-fatal: summary processing lag is normal; today's meeting retried tomorrow
[ $rc -eq 0 ] || echo "WARN: zoom-fetch-transcripts failed (rc=$rc) â€” will retry on next run"

echo "######## $(ts) sp-pipeline done OK ########"
