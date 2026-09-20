# Spurti SP Pipeline

The data pipeline that computes Spurti Points and feeds the Spurti web app
(`../server`, `../client`). These scripts are the **source of truth for SP
scoring** — the `+5/-5` logic that used to live in `server/scripts/` is retired.

> **Which scorer is live (since 28 Jun 2026):** `sp-rubric-build-mirror.cjs`, run
> from the sakshi-side checkout by `../sp-refresh.sh` four times a day. It reads
> only the `sakshi_spurti` mirrors. The original live-Zoom scorer
> (`sp-rubric-build.js`, `sp-pipeline.sh`) was removed from the repository on
> 18 Sep 2026; it is in git history if the May–June scoring ever has to be traced. The full current rubric — evening window, Spandan polls, hybrid
> attendance, SPA, query, project, quiz — is documented in `../CONTEXT.md`;
> the rubric summary below describes parts A and B only.

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

## Scoring rubric, parts A and B (implemented in `sp-rubric-build-mirror.cjs`)

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

**Sakshi side** (run from `/home/sakshi/spurti`, read `../.env`):

| File | Role |
|------|------|
| `sp-rubric-build-mirror.cjs` | **The scorer.** Base 100 + attendance + poll + SPA + query + project (+ quiz on the server) from the `sakshi_spurti` mirrors. Dry run by default; `APPLY=1` backs up then wipes and rebuilds `sptransactions`. `manual`/`peer_faq` rows are preserved. |
| `spandan-poll-fetch.cjs` | Spandan Research Session Export API → `spandan_polls`. Source for poll SP and for hybrid attendance from 16 Jul / 29 Jul. Needs `SPANDAN_RESEARCH_KEY`. Additive only. |
| `sync-attendance-records.cjs` | Rebuild `attendancerecords` from `sptransactions` (feeds the Session Health widget and the 3,600-minute Journey goal). |
| `sync-poll-records.cjs` | Rebuild `pollrecords` from `sptransactions`. Rewritten 14 Aug 2026. |
| `vibe-fetch.cjs` | ViBe course completion → `vibe_course_progress`; raw responses archived under `data/vibe-snapshots/`. The endpoint is unreliable; pull whenever it answers. |
| `vtalk-attendance-build.cjs` | V-Talk nights from the Zoom mirror → `vtalk_attendance`, scored by the rubric's V-Talk pass. Re-run when new V-Talk data arrives. |
| `certificate-freeze.cjs` | Write-once `certificate_finals` rows for students with a `completedAllAt` date. Re-running only adds newly completed students. |

**Samagama side** (`samagama/`, run from `/var/samagama/server` as `samagama`, kept here verbatim with their absolute paths):

| File | Role |
|------|------|
| `zoom-update.js` | `#zoomupdate`: fetch Zoom into `zoom_data`, mirror to `sakshi_spurti.zoom_*`, chain transcript ingest. |
| `cron-sakshi-zoom.sh` | Every-6h `#zoomupdate` wrapper (`/etc/cron.d/sakshi-zoom`). |
| `sync-sakshi-zoom-mirror.js` | `zoom_data.*` → `sakshi_spurti.zoom_*` (Sakshi has RW only on her DB). |
| `sync-collaborator-mirrors.js` | Nightly roster mirror of `chatengine.users` → `{rohit_spandan,sakshi_spurti,aditya_platform}.candidates`. |
| `sync-spurti-from-sakshi.js` | Mirror `sakshi_spurti.sptransactions` → `chatengine.spledgers` + `User.spPoints`, so the Samagama dashboard's SP button agrees with Spurti. |
| `zoom-fetch-transcripts.js` | Zoom AI Companion summaries → `zoom_data.summaries`. |
| `zoom-ingest-all-transcripts.js` | Zoom VTT transcripts → `zoom_data.transcripts`. |

The `act_*` activity mirrors the SPA, query, project, ViBe and quiz rules read
(`act_spa_endorsements`, `act_query_reviews`, `act_pr_reviews`, `act_pull_requests`,
`act_vibe_progress`, `act_faq_quiz_attempts`) are written by a 6-hourly cron in the
**Samagama** repository, not by anything here.

## Schedule

**Sakshi side** (`sakshi` crontab on samagama.in):

| When (IST) | Job |
|-----------|-----|
| 11:30, 17:30, 23:30, 05:30 | `../sp-refresh.sh` — Spandan fetch → `sp-rubric-build-mirror.cjs APPLY=1` → `sync-levels.cjs` → `sync-attendance-records.cjs` → `buildTrajectories.js` → `buildLeaderboards.js`. Single-instance lock; step outcomes in `STEP_HEALTH_FILE`; alert webhook after repeated failures. |
| every 30 min | `../snapshot-analytics.js` |
| every 10 min while a survey is open | `../survey-sheet-sync.cjs`, `../poll2-sheet-sync.cjs` |
| weekly | `../sp-runs-retention.sh` |
| on a cron (see script header) | `certificate-freeze.cjs` |

**Samagama side** (`/etc/cron.d`, UTC):

| When (UTC) | When (IST) | Job |
|------------|-----------|-----|
| `30 1,7,13,19 * * *` | 07:00/13:00/19:00/01:00 | `samagama/cron-sakshi-zoom.sh` — `#zoomupdate` every 6h |
| `30 */2 * * *` | every even hour | `sync-spurti-from-sakshi.js` — SP → chatengine |
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
node sync-spurti-from-sakshi.js
# the live scorer (sakshi side): preview, then apply via the refresh
cd ~/spurti
node pipeline/sp-rubric-build-mirror.cjs                 # dry run, writes ledger CSV only
./sp-refresh.sh                                          # fetch -> APPLY -> levels -> records -> boards
```
