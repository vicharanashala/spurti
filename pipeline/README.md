# Spurti SP Pipeline

The data pipeline that computes Spurti Points and feeds the Spurti web app
(`../server`, `../client`). These scripts are the **source of truth for SP
scoring** — the `+5/-5` logic that used to live in `server/scripts/` is retired.

> **Deployment note.** The live copy runs from `/var/samagama/server/` as the
> `samagama` OS user, driven by cron (see below). The files here are a
> version-controlled mirror of that deployment. They are kept **verbatim**,
> including absolute paths like `/var/samagama/server/.env` and
> `/var/samagama/server/node_modules/...`, so this repo documents exactly what
> production runs. If you deploy from the repo instead, those paths and the
> `require()` targets must be adjusted, and `npm i` must provide `mongodb`,
> `mongoose`, `axios`, `dotenv`. Credentials come only from
> `/var/samagama/server/.env` (see `.env.example`); nothing is hardcoded.

## Architecture (two halves)

```
Zoom  ──zoom-update.js──►  zoom_data.{meetings,attendance,polls,summaries,transcripts}
                                  │
                 sync-sakshi-zoom-mirror.js (chained inside zoom-update.js)
                                  ▼
                        sakshi_spurti.zoom_*           chatengine.users (vinsStartDate)
                                  │                              │
                                  └────────► sp-rubric-build.js ◄┘   (APPLY=1)
                                                   │  scores A+B+base100 (bands)
                                                   ▼
                        sakshi_spurti.students.totalSp + sakshi_spurti.sptransactions
                                  │                         │
        sync-attendance-records / sync-poll-records     sync-spurti-from-sakshi.js
                                  ▼                         ▼
        sakshi_spurti.{attendancerecords,pollrecords}   chatengine.spledgers + User.spPoints
                                  │
                  Spurti web app (../server) reads sakshi_spurti  ──►  https://samagama.in/spurti/
```

## Scoring rubric (implemented in `sp-rubric-build.js`)

- **Base 100**, roster-driven: every *started intern* gets +100 on their
  official start date, even if they never attend. "Started" = start date has
  arrived. Future-start interns are zeroed; non-intern roster entries are set aside.
- **Mandatory session** = the first daily Zoom instance with ≥10 attendees.
  Its official window is `[09:05 IST, min(first-instance-end, 11:00 IST)]`.
- **Attendance (A):** presence clipped strictly to the official window.
  `pct = clipped-minutes / window-minutes`, then **band/tier**:

  | percent | SP |
  |---------|----|
  | ≥ 90%   | +10 |
  | 75–89%  | +5  |
  | 50–74%  | +3  |
  | < 50%   | 0   |

- **Poll (B):** `pct = answered / totalQuestions`, same band ladder (10/5/3/0). Per session.
- **Grace day `2026-06-06`:** a 1-minute join counts as full attendance + full poll.
- Discretionary admin awards/deductions (rubric "Part C") are handled separately
  (chat SP review in the web app), not here.

The pipeline is **idempotent**: `sp-rubric-build.js` backs up, then wipes and
re-inserts the full ledger each run, so re-running never double-counts.

## Files

| File | Role |
|------|------|
| `sp-pipeline.sh` | Master daily orchestrator (fail-fast, 6 stages). |
| `sp-pipeline.cron` | Cron definitions installed at `/etc/cron.d/sp-pipeline`. |
| `cron-sakshi-zoom.sh` | Every-6h `#zoomupdate` wrapper (`/etc/cron.d/sakshi-zoom`). |
| `zoom-update.js` | `#zoomupdate`: fetch Zoom into `zoom_data`, mirror to `sakshi_spurti.zoom_*`, chain transcript ingest. |
| `sp-rubric-build.js` | **The scorer.** A+B+base100 bands → `sakshi_spurti`. `APPLY=1` to write. |
| `sync-spurti-from-sakshi.js` | Mirror `sakshi_spurti.sptransactions` → `chatengine.spledgers` + `User.spPoints`. |
| `sync-attendance-records.js` | Rebuild `sakshi_spurti.attendancerecords` from `sptransactions`. |
| `sync-poll-records.js` | Rebuild `sakshi_spurti.pollrecords` from `sptransactions`. |
| `zoom-fetch-transcripts.js` | Zoom AI Companion summaries → `zoom_data.summaries`. |
| `zoom-ingest-all-transcripts.js` | Zoom VTT transcripts → `zoom_data.transcripts`. |
| `sync-sakshi-zoom-mirror.js` | `zoom_data.*` → `sakshi_spurti.zoom_*` (Sakshi has RW only on her DB). |
| `sync-collaborator-mirrors.js` | Nightly roster mirror of `chatengine.users` → `{rohit_spandan,sakshi_spurti,aditya_platform}.candidates`. This is the roster sync. |
| `models/User.js` | Mongoose model used by `sync-spurti-from-sakshi.js`. |

## Schedule (cron, UTC)

| When (UTC) | When (IST) | Job |
|------------|-----------|-----|
| `45 5 * * *` | 11:15 | `sp-pipeline.sh` — same-day scoring of the morning session |
| `15 21 * * *` | 02:45 | `sp-rubric-build.js APPLY=1` — nightly full rebuild |
| `30 1,7,13,19 * * *` | 19:00/01:00/07:00/13:00 | `cron-sakshi-zoom.sh` — `#zoomupdate` every 6h |
| `30 */2 * * *` | every even hr | `sync-spurti-from-sakshi.js` — SP → chatengine |
| `30 7 * * *` | 13:00 | `zoom-fetch-transcripts.js` + `zoom-ingest-all-transcripts.js --days 2` |
| `30 18 * * *` (+jitter) | ~00:00–01:00 | `sync-collaborator-mirrors.js` — roster mirror |

## Manual run (catch-up)

```bash
cd /var/samagama/server
# ingest a date range of Zoom data
node --max-old-space-size=2048 zoom-update.js --from 2026-06-24 --to 2026-06-27
# preview the score (no writes), then apply
node sp-rubric-build.js                 # dry preview
APPLY=1 OUT_DIR=./sp-runs node sp-rubric-build.js
# push to the app + records
node sync-spurti-from-sakshi.js && node sync-attendance-records.js && node sync-poll-records.js
```
### Notifications

After the daily SP pipeline completes successfully, `notify.js` publishes a notification to the configured ntfy topic.

Required environment variables:

NTFY_URL=https://ntfy.sh
NTFY_TOPIC=spurti-announcements