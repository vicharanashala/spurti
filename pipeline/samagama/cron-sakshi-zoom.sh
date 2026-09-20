#!/bin/bash
# Every 6h from 19:00 IST (19:00,01:00,07:00,13:00 IST): run #zoomupdate.
# zoom-update.js now mirrors zoom_data -> sakshi_spurti.zoom_* itself at the end
# of every run, so this just runs #zoomupdate (2GB heap: default 7-day window
# can OOM at default heap). Installed via /etc/cron.d/sakshi-zoom. Added 2026-05-26.
cd /var/samagama/server || exit 1
echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') #zoomupdate (+sakshi mirror) start ==="
/usr/bin/node --max-old-space-size=2048 zoom-update.js
echo "--- exit=$? ---"
echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') end ==="
