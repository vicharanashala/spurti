#!/bin/bash
# sp-pipeline.sh — daily Spurti pipeline, fired 05:45 UTC (11:15 IST) by
# /etc/cron.d/sp-pipeline, right after the 09:00-11:00 IST mandatory session.
# Runs the stages in order so the morning session is scored SAME-DAY
# instead of waiting for the 21:15 UTC nightly build:
#
#   1. pipeline/sp-rubric-build-mirror.cjs  APPLY=1  score attendance(A)+poll(B)+base100
#      into sakshi_spurti (backs up first; idempotent wipe-and-replace)
#   2. sync-spurti-from-sakshi mirror sakshi_spurti SP into chatengine
#      (spledgers + User.spPoints) so /spurti reflects it
#   3. sync-attendance-records sync sakshi_spurti.attendancerecords from
#      sptransactions so Session Health widget is accurate
#   4. sync-poll-records      sync sakshi_spurti.pollrecords from sptransactions
#   5. zoom-fetch-transcripts fetch AI Companion summaries into zoom_data.summaries
#      (non-fatal: summary may still be processing at 11:15;
#       today's meeting is retried on next run)
#
# Fail-fast: each stage must exit 0 before the next runs. Single-instance via
# flock in the cron line. Added 2026-06-04.
set -u
cd /var/samagama/server || exit 1
NODE=/usr/bin/node
HEAP="--max-old-space-size=2048"
ts(){ date -u '+%Y-%m-%dT%H:%M:%SZ'; }

echo "######## $(ts) sp-pipeline start ########"

echo "=== $(ts) STAGE 1/6: #zoomupdate (ingest + sakshi mirror) ==="
$NODE $HEAP zoom-update.js
rc=$?; echo "--- $(ts) stage1 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: #zoomupdate failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 2/6: sp-rubric-build-mirror APPLY=1 ==="
APPLY=1 OUT_DIR=/var/samagama/server/sp-runs $NODE $HEAP pipeline/sp-rubric-build-mirror.cjs
rc=$?; echo "--- $(ts) stage2 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sp-rubric-build-mirror failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 3/6: sync-spurti-from-sakshi (-> chatengine) ==="
$NODE sync-spurti-from-sakshi.js
rc=$?; echo "--- $(ts) stage3 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: spurti mirror failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 4/6: sync-attendance-records (-> sakshi_spurti) ==="
$NODE sync-attendance-records.cjs
rc=$?; echo "--- $(ts) stage4 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sync-attendance-records failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 5/6: sync-poll-records (-> sakshi_spurti) ==="
$NODE sync-poll-records.cjs
rc=$?; echo "--- $(ts) stage5 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sync-poll-records failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 6/6: zoom-fetch-transcripts (AI summaries -> zoom_data.summaries) ==="
$NODE $HEAP pipeline/zoom-fetch-transcripts.js
rc=$?; echo "--- $(ts) stage6 exit=$rc ---"
# Non-fatal: summary processing lag is normal; today's meeting retried tomorrow
[ $rc -eq 0 ] || echo "WARN: zoom-fetch-transcripts failed (rc=$rc) — will retry on next run"

echo "######## $(ts) sp-pipeline done OK ########"
