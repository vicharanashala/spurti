# Spurti SP Pipeline

The data pipeline that computes Spurti Points and feeds the Spurti web app
(`../server`, `../client`). The scorer is `sp-rubric-build-mirror.cjs` (sakshi
side). Full details of the live scoring rubric — attendance window, evening
cutover, poll correctness, SPA validated endorsements, and the query-answer pay
+ forward penalty — are documented in **CONTEXT.md → "SP Calculation — band/tier
rubric (current, 2026-08)"**. This README keeps only the historical outline that
the retired `sp-rubric-build.js` implemented:

- **Base 100**, roster-driven: every *started intern* gets +100 on their
  official start date. Future-start interns zeroed; non-intern entries set aside.
- **Mandatory session** = first daily Zoom instance with ≥10 attendees; window
  `[09:05 IST, min(first-instance-end, 11:00 IST)]`.
- **Attendance (A):** `pct = clipped-minutes / window-minutes`, band/tier below.

  | percent | SP |
  |---------|----|
  | ≥ 90%   | +10 |
  | 75–89%  | +5  |
  | 50–74%  | +3  |
  | < 50%   | 0   |

- **Poll (B):** `pct = answered / totalQuestions`, same band ladder (10/5/3/0). Per session.
- **Grace day `2026-06-06`:** a 1-minute join counts as full attendance + full poll.

The ledger is **idempotent**: the scorer backs up, then wipes and re-inserts the
full ledger each run, so re-running never double-counts.

## Files

| File | Role |
|------|------|
| `sp-rubric-build-mirror.cjs` | **THE SCORER (sakshi-side).** Band/tier → `sakshi_spurti`. `APPLY=1` to write. Run from `~/spurti/sp-refresh.sh`. |
| `spandan-poll-fetch.cjs` | Incremental fetch of Spandan evening polls → `sakshi_spurti.spandan_polls` (run by `sp-refresh.sh`). |
| `sync-attendance-records.cjs` | Rebuild `sakshi_spurti.attendancerecords` from `sptransactions`. Runs from **Sakshi's** `sp-refresh.sh`. |
| `sync-poll-records.cjs` | Rebuild `sakshi_spurti.pollrecords` from `sptransactions`. Runs from **Sakshi's** `sp-refresh.sh` (wired in as Step 2c). |
| `vibe-fetch.cjs` | ViBe commitment mirror. |
| `sp-pipeline.sh` | **RETIRED** samagama-side daily orchestrator (6 stages). Runs the retired `sp-rubric-build.js` APPLY — **do not enable**. Kept only for provenance. |
| `sp-pipeline.cron` | **RETIRED** cron definitions at `/etc/cron.d/sp-pipeline` (same caution as above). |
| `cron-sakshi-zoom.sh` | Every-6h `#zoomupdate` wrapper (`/etc/cron.d/sakshi-zoom`) — samagama's Zoom mirror feed. |
| `zoom-update.js` | `#zoomupdate`: fetch Zoom into `zoom_data`, mirror to `sakshi_spurti.zoom_*`, chain transcript ingest. **Still live** (Zoom mirror feed). |
| `sp-rubric-build.js` | **RETIRED** samagama-side scorer (live-API). Caused the 2026-06-27 regression. Historical only. |
| `sync-spurti-from-sakshi.js` | Mirror `sakshi_spurti.sptransactions` → `chatengine.spledgers` + `User.spPoints`. Samagama-side. |
| `sync-attendance-records.js` | **STALE** (samagama-side copy of the `.cjs`); only the `.cjs` exists in this repo. Left behind by the 2026-06-28 move. |
| `sync-poll-records.js` | **STALE/NONEXISTENT** in this repo; only `sync-poll-records.cjs` exists. Left behind by the 2026-06-28 move. |
| `zoom-fetch-transcripts.js` | Zoom AI Companion summaries → `zoom_data.summaries`. Samagama-side feed. |
| `zoom-ingest-all-transcripts.js` | Zoom VTT transcripts → `zoom_data.transcripts`. Samagama-side feed. |
| `sync-sakshi-zoom-mirror.js` | `zoom_data.*` → `sakshi_spurti.zoom_*`. Chained in `zoom-update.js`. |
| `sync-collaborator-mirrors.js` | Nightly roster mirror of `chatengine.users` → `{rohit_spandan,sakshi_spurti,aditya_platform}.candidates`. This is the roster sync. |
| `.env.example` | Template for the environment file. |
| `models/User.js` | Mongoose model used by `sync-spurti-from-sakshi.js`. |

## Schedule (cron, UTC)

**Current (sakshi side) — see `~/spurti/sp-refresh.sh`:**

| When (UTC) | When (IST) | Job |
|------------|-----------|-----|
| every 6h (06/12/18/00) | 11:30/17:30/23:30/05:30 | `sp-refresh.sh` — `spandan-poll-fetch` → `sp-rubric-build-mirror.cjs APPLY=1` → `sync-levels` → `sync-attendance-records` → `sync-poll-records` → trajectory snapshot → leaderboards |

**Retired samagama side (`/etc/cron.d/*`)** — do not re-enable the APPLY stage:

| When (UTC) | When (IST) | Job |
|------------|-----------|-----|
| `45 5 * * *` | 11:15 | `sp-pipeline.sh` — **retired** scoring (runs `sp-rubric-build.js` APPLY) |
| `15 21 * * *` | 02:45 | `sp-rubric-build.js APPLY=1` — **retired** nightly rebuild |
| `30 1,7,13,19 * * *` | 19:00/01:00/07:00/13:00 | `cron-sakshi-zoom.sh` — `#zoomupdate` (**still live**, Zoom mirror feed) |
| `30 */2 * * *` | every even hr | `sync-spurti-from-sakshi.js` — SP → chatengine |
| `30 7 * * *` | 13:00 | `zoom-fetch-transcripts.js` + `zoom-ingest-all-transcripts.js --days 2` |
| `30 18 * * *` (+jitter) | ~00:00–01:00 | `sync-collaborator-mirrors.js` — roster mirror |

## Manual run (catch-up, current)

```bash
# ingest a date range of Zoom data (samagama side)
cd /var/samagama/server
node --max-old-space-size=2048 zoom-update.js --from 2026-06-24 --to 2026-06-27
# ...then score on the SAKSHI side (never run sp-rubric-build.js on samagama):
cd ~/spurti
node sp-rubric-build-mirror.cjs                 # dry preview
APPLY=1 OUT_DIR=./sp-runs node sp-rubric-build-mirror.cjs
# attendance + poll records are rebuilt by Sakshi's sp-refresh.sh:
#   cd ~/spurti && node pipeline/sync-attendance-records.cjs && node pipeline/sync-poll-records.cjs
```
