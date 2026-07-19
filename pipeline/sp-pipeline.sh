#!/bin/bash
# sp-pipeline.sh — daily Spurti pipeline, fired 05:45 UTC (11:15 IST) by
# /etc/cron.d/sp-pipeline, right after the 09:00-11:00 IST mandatory session.
# Runs the three stages in order so the morning session is scored SAME-DAY
# instead of waiting for the 21:15 UTC nightly build:
#
#   1. #zoomupdate            zoom-update.js — ingest today's Zoom attendance +
#                             polls into zoom_data, then mirror to
#                             sakshi_spurti.zoom_*  (2GB heap: 7-day window can OOM)
#   2. sp-rubric-build APPLY  score attendance(A)+poll(B)+base100 into
#                             sakshi_spurti (backs up first; idempotent
#                             wipe-and-replace) -> CSVs/backups in sp-runs/
#   3. sync-spurti-from-sakshi mirror sakshi_spurti SP into chatengine
#                             (spledgers + User.spPoints) so /spurti reflects it
#   4. sync-attendance-records sync sakshi_spurti.attendancerecords from
#                             sptransactions so Session Health widget is accurate
#   5. sync-poll-records      sync sakshi_spurti.pollrecords from sptransactions
#   6. zoom-fetch-transcripts fetch AI Companion summaries into zoom_data.summaries
#                             (non-fatal: summary may still be processing at 11:15;
#                              today's meeting is retried on next run)
#   7. (transcript ingest is now chained inside zoom-update.js itself — no separate stage)
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

echo "=== $(ts) STAGE 2/3: sp-rubric-build-mirror APPLY=1 ==="
APPLY=1 OUT_DIR=/var/samagama/server/sp-runs $NODE $HEAP sp-rubric-build-mirror.cjs
rc=$?; echo "--- $(ts) stage2 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sp-rubric-build-mirror failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 3/3: sync-spurti-from-sakshi (-> chatengine) ==="
$NODE sync-spurti-from-sakshi.js
rc=$?; echo "--- $(ts) stage3 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: spurti mirror failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 4/5: sync-attendance-records (-> sakshi_spurti) ==="
$NODE sync-attendance-records.js
rc=$?; echo "--- $(ts) stage4 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sync-attendance-records failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 5/6: sync-poll-records (-> sakshi_spurti) ==="
$NODE sync-poll-records.js
rc=$?; echo "--- $(ts) stage5 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sync-poll-records failed (rc=$rc)"; exit 1; }

echo "=== $(ts) STAGE 6/6: zoom-fetch-transcripts (AI summaries -> zoom_data.summaries) ==="
$NODE zoom-fetch-transcripts.js
rc=$?; echo "--- $(ts) stage6 exit=$rc ---"
# Non-fatal: summary processing lag is normal; today's meeting retried tomorrow
[ $rc -eq 0 ] || echo "WARN: zoom-fetch-transcripts failed (rc=$rc) — will retry on next run"

echo "######## $(ts) sp-pipeline done OK ########"
