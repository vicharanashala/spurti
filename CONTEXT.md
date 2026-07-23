# Spurti Project Context

## Overview
Spurti is a student engagement tracking app for the VLED Summership program at IIT Ropar. It tracks student attendance, polls, chat participation, and awards SP (Spurti Points).

## Running
- **Production:** `https://samagama.in/spurti/`
- **Dev server:** `cd /Users/sakshivk/sakshigit/spurti && node server/server.js`
- **Port:** 5003
- **MongoDB:** `sakshi_spurti` on `127.0.0.1:27017` (credentials in `.env` `MONGO_URI`, authSource: sakshi_spurti)

## Key People
- **Admin/owner:** Rohit (rohit@iitrpr.ac.in) — manages students, SP reviews
- **Student roster:** Updated daily from IIT Ropar form submissions

## Tech Stack
- **Frontend:** React + Vite (client/), served as static SPA
- **Backend:** Express.js (server/server.js)
- **Database:** MongoDB with Mongoose
- **Auth:** Cookie-based (`spurti_student`), HMAC-signed token via `/spurti/auth?token=`
- **Nginx proxy:** `/spurti` → `127.0.0.1:5003`

## Database Schema

### students
```
_id, name, email, alternateEmail,
internshipStartDate, internshipEndDate,
status: 'active' | 'excused',
excusedAt, excusedReason,
totalSp (default: 100)
```

### sessions
```
label, date, type, startDateTime, endDateTime, totalMinutes
```

### sptransactions
```
email, studentId, category, sessionLabel,
deltaMode: 'absolute' | 'percentage',
deltaValue, appliedDelta, balanceAfter,
reason, dateTime, createdAt
```

### attendancerecords
```
email, studentId, sessionLabel,
attendedMinutes, totalSessionMinutes,
attendancePercentage, qualified,
transactionId
```

### pollrecords
```
email, studentId, sessionLabel,
totalQuestions, attemptedQuestions, missedQuestions,
responses[], transactionId
```

### chatrecords
```
email, studentId, sessionLabel,
messages[], positiveCount, negativeCount, neutralCount,
overallSentiment, transactionId
```

### chatspreviews (ChatSPReview)
```
sessionLabel, dateTime, studentName, studentEmail, studentId,
issuedByName, delta, reason, evidenceText, sourceMessage,
sourceMessageKey, confidence,
status: 'pending' | 'accepted' | 'rejected',
reviewedBy, reviewedAt, transactionId
```

### streaks
```
email (unique, indexed), studentId (ref Student, indexed),
currentStreak (default: 0), longestStreak (default: 0),
heartsRemaining (default: 2), heartsUsed (default: 0),
lastQualifyingDate (string), lastProcessedDate (string),
streakStartDate (Date), totalStreakSp (default: 0),
lastHeartUseDate (string),
history: [{ date: string, sp: number, type: 'daily' | 'milestone' | 'heart_save' }],
timestamps
```
Index on `currentStreak: -1` for leaderboard sorting.

## Architecture — two halves

1. **Web app (this repo, `server/` + `client/`)** — Express API + React SPA,
   served live on `127.0.0.1:5003`. Read-only consumer of `sakshi_spurti`.
2. **SP pipeline (`pipeline/`, deployed at `/var/samagama/server`, runs as the
   `samagama` user via cron)** — the scoring engine that WRITES `sakshi_spurti`.
   See `pipeline/README.md` for the full data flow, cron schedule, and rubric.

The two communicate only through the `sakshi_spurti` MongoDB. The web app never
computes SP.

**Scoring moved to the sakshi side (2026-06-28).** SP is now computed by
`pipeline/sp-rubric-build-mirror.cjs`, which reads ONLY `sakshi_spurti` mirrors
(`zoom_meetings`, `zoom_attendance`, `zoom_polls`, `candidates`, `students`) —
no Zoom credentials, no live Zoom Reports API, no `zoom_data`/`chatengine`
access. This replaced the live-API dependency in the samagama-side
`pipeline/sp-rubric-build.js` that caused the 27 Jun regression (sessions older
than Zoom's ~3–4 week report retention were fetched as empty and scored 0).
Samagama's only remaining job is feeding two mirrors (Zoom data + expanded
`candidates` roster) — see `HANDOFF_MIRROR_AND_ROSTER.md`. Run:
`node sp-rubric-build-mirror.cjs` (dry) / `APPLY=1 … node sp-rubric-build-mirror.cjs`
(writes; auto-backs-up `sptransactions`+`students`; reconciles the leaderboard to
the ledger, clearing anyone not in it). Rules are identical to the band/tier
rubric below; only the data sources changed.

## SP Calculation — band/tier rubric (current, 2026-06)

Implemented in `pipeline/sp-rubric-build.js` (NOT in this repo's `server/scripts/`,
which hold the retired CSV/±5 logic). See `pipeline/README.md` for detail.

- **Initial:** +100 to every *started intern* on their official start date.
  Future-start interns are zeroed; non-intern roster entries are set aside.
- **Attendance (A):** presence clipped to the official window
  `[09:05 IST, min(first-instance-end, 11:00 IST)]`; `pct = clipped / window`,
  then banded: **≥90% → +10, 75–89% → +5, 50–74% → +3, <50% → 0**.
- **Poll (B):** `pct = answered / totalQuestions`, same band ladder (10/5/3/0).
- **Grace day 2026-06-06:** 1-min join = full attendance + full poll.
- **Chat / discretionary:** admin-reviewed via ChatSPReview in the web app
  (absolute or %-of-balance award). Currently dormant (`chatrecords` empty).

> NOTE: session labels are now `Day N (DD Mon)` / `Orientation (15 May)`
> (produced by the pipeline), NOT the old `"15 May Morning"` form still listed
> in `server/config.js SESSION_LABELS`. The display path in `server/services/sp.js`
> iterates the old labels and is out of sync — known issue to reconcile.

## Legacy scripts (`server/scripts/`, superseded by `pipeline/`)

`ingestSession.js`, `rebuild.js`, `syncStudents.js`, `seed.js`, `ingestChat.js`,
`split22MaySessions.js` are the original CSV-based ±5 pipeline. They remain only
because `server/server.js` and a few of them still import
`server/scripts/lib/ingestion.js` (`recalculateStudentSp`). Do not run them for
scoring — the `pipeline/` rubric is authoritative. The old Zoom ±5 ingest
(`ingest-zoom-session.js`, `lib/ingestZoomCollections.js`, `lib/ingestZoomLib.js`,
`run-zoom-ingest.sh`) has been deleted.

## Admin Endpoints
- `GET /api/leaderboard` — SP rankings
- `GET /api/admin/chat-sp-reviews` — pending reviews
- `POST /api/admin/chat-sp-reviews/:id/accept` — award SP
- `POST /api/admin/chat-sp-reviews/:id/reject` — reject
- `GET /api/admin/streaks` — list all streak documents (sort, limit)
- `POST /api/admin/streak/process-all` — trigger daily streak processing for all students

## Streak Score Feature

### What it is
The Streak Score incentivises daily attendance consistency. Students earn bonus SP
for attending sessions on consecutive days (Mon–Sat). Sundays are excluded — they
do **not** count as streak days and do **not** break streaks.

### Eligibility
- Only students whose `internshipStartDate` is **on or after 2026-07-16** are
  eligible. Students who started earlier get no streak processing at all.
- Students with `status: 'excused'` are excluded.

### How qualification works (per day)
A student qualifies for a streak day if **at least one session** on that date has
**both**:
1. `attendancePercentage >= 85%` (from `attendancerecords`)
2. `poll participation >= 85%` (from `pollrecords`)

If no `attendancerecords` exist (dev / pre-pipeline), the system falls back to
`sptransactions`: `appliedDelta >= 10` (which implies >= 90%) satisfies the 85%
threshold.

### SP rewards
| Streak day | SP earned |
|-----------|-----------|
| Days 1–9 | 1 SP/day |
| Day 10 (milestone) | 5 SP |
| Days 11–19 | 1 SP/day |
| Day 20 (milestone) | 7 SP |
| Days 21–29 | 1 SP/day |
| Day 30 (milestone) | 9 SP |
| Days 31+ | 2 SP/day |
| Day 40 (milestone) | 11 SP |
| Every 10th day after 30 | +2 more than previous milestone |

**Milestone formula:** `3 + (streakDay / 10) * 2`

### Hearts (streak savers)
Each student starts with **2 hearts**. If a day is missed, a heart is consumed to
preserve the streak. Hearts are **not** used during backfill. Losing both hearts
resets the streak to 0.

When a heart is used, `lastQualifyingDate` is updated to the heart-saved date,
resetting the gap counter so consecutive hearts work correctly.

### Gap logic (Sunday-aware)
The `isConsecutiveGap` check uses `nextWeekday()` instead of `addDays(..., 1)`.
This means if the last qualifying date was Friday, the expected next qualifying
day is Monday (skipping Sunday). A student who qualifies on Friday, misses
Saturday (heart), and misses Monday (heart) can use both hearts without breaking
the streak.

### API endpoints
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/streak` | Student (cookie) | Returns streak status for the logged-in student |
| `POST` | `/api/streak/claim` | Student (cookie) | Manually claim streak SP from the dashboard |
| `GET` | `/api/admin/streaks` | Admin guard | List all streak documents, sorted and limited |
| `POST` | `/api/admin/streak/process-all` | Admin guard | Trigger daily streak processing for all students on a given date |

Streak data is also embedded in the profile response (`profile.streak`).

### Cron job — `server/cron/streakDaily.js`
Standalone Node script using the raw MongoDB driver (not Mongoose). Designed to
run daily after the main SP pipeline completes.

**Environment variables:**
- `MONGO_URI` — from `.env` (same DB as the web app)
- `DATE=YYYY-MM-DD` — process a specific date (default: yesterday, IST-aware)
- `DRY_RUN=1` — log results without writing to DB
- `BACKFILL=1` — process from each student's start date (one-time setup)

**Behaviour:**
- Automatically skips Sundays (shifts target date to Saturday if needed)
- Skips students whose `internshipStartDate` is before `STREAK_CUTOFF_DATE`
- In backfill mode, skips Sundays in the date range
- Uses `nextWeekday()` for gap logic (same as streakService.js)
- Updates `lastQualifyingDate` on heart use (same as streakService.js)

### Frontend
- **`StreakCard`** — compact summary on the dashboard (current streak, hearts,
  SP, next milestone, today status)
- **`StreakDetail`** — full tab view with stats grid, "How it works" rules, and
  recent history table
- **Tab label:** "Streak" (second tab)
- **CSS:** `client/src/styles.css` lines 1103–1176

### Files involved
| File | Purpose |
|------|---------|
| `server/config.js` | Threshold constants (85/85/2) + `STREAK_CUTOFF_DATE` |
| `server/models/Streak.js` | Mongoose schema for `streaks` collection |
| `server/services/streakService.js` | Core business logic (qualification, processing, claim, status) |
| `server/cron/streakDaily.js` | Standalone daily cron script |
| `server/server.js:1100-1144` | API routes + profile injection |
| `server/models/SPTransaction.js` | `'streak'` in category enum |
| `client/src/main.jsx:337-440` | `StreakCard` + `StreakDetail` React components |
| `client/src/styles.css:1103-1176` | Streak CSS |
| `server/services/__tests__/streakService.test.js` | 37 unit tests |

### What the admin needs to do after merging

#### 1. Pull and build on production server
```bash
cd /home/sakshi/spurti
git pull origin main
npm install
npm --prefix client install && npm run build
```

#### 2. Restart the Express server
```bash
# Restart however the server is managed (pm2, systemd, etc.)
pm2 restart spurti
```
The `streaks` collection is auto-created by MongoDB on first write — no manual
DB migration needed.

#### 3. One-time backfill (historical streak data)
Run with `DRY_RUN=1` first to preview:
```bash
BACKFILL=1 DRY_RUN=1 node server/cron/streakDaily.js
```
Then run for real:
```bash
BACKFILL=1 node server/cron/streakDaily.js
```
This processes every active student with `internshipStartDate >= 2026-07-16`
from their start date through yesterday. Students who started before the cutoff
are automatically skipped.

#### 4. Set up daily cron job
Add to crontab (`crontab -e`) to run after the main SP pipeline each day:
```
# Streak processing — runs daily at 23:59 IST (18:59 UTC) after pipeline
59 18 * * * cd /home/sakshi/spurti && node server/cron/streakDaily.js >> /home/sakshi/spurti/logs/streak.log 2>&1
```
The script automatically skips Sundays and students before the cutoff date.

#### 5. Verify
- Open `/spurti` as a student → streak card + "Streak" tab should appear
- Admin: `GET /api/admin/streaks` → should return scored students
- Admin: `POST /api/admin/streak/process-all` with `{ "date": "2026-07-17" }`
  → manual trigger for a specific date

#### No other action needed
- No `.env` changes required (cron uses existing `MONGO_URI`)
- No schema migration — Mongoose auto-creates the `streaks` collection
- Frontend is built into `client/dist` and served as static files

## Auth — `chatengine_token` cookie passthrough (LIVE since 2026-06-29)
Spurti lives at `samagama.in/spurti` (same domain as Samagama), so the browser
already holds the student's **`chatengine_token`** cookie. There is **no login
page and no token in the URL** — the student just opens `/spurti`.

Flow: client calls `/api/me` (same-origin → cookie auto-sent) → server reads
`chatengine_token` and forwards it as `Cookie: chatengine_token=<v>` to
Samagama's internal endpoint **`http://127.0.0.1:5001/api/auth/me`**
(`SAMAGAMA_AUTH_URL`, default in `config.js`). 200 → body is `{ user: { email,
name, … } }`; Spurti reads `user.email`, looks up the Student by
`{email | alternateEmail}`, returns the dashboard. 401 → Spurti returns
`{authenticated:false}` and the "open from your Samagama dashboard" page shows.
Code: `getSamagamaUser` / `studentEmailFromRequest` in `server/server.js`.

> **Retired (do NOT reintroduce):** the old HMAC handoff — `SPURTI_AUTH_SECRET`,
> the `spurti_student` signed cookie, and the `GET /spurti/auth?token=…` routes.
> Samagama deleted its shared secret, so any HMAC code here verifies against an
> empty secret and 401s **every** student (this caused the 2026-06-29 outage).

## Server Info (samagama.in)
- **SSH:** `ssh sakshi@samagama.in` (Mac SSH key)
- **SSH path:** `/home/sakshi/spurti` — prod app, port 5003
- **MongoDB:** `sakshi_spurti` on `127.0.0.1:27017` (credentials in `.env` `MONGO_URI`, authSource=sakshi_spurti) — **THIS IS THE SOLE SOURCE OF TRUTH**
- **Workspace copy:** `/var/samagama/spurti-workspace/spurti` (NOT active, no longer has separate MongoDB — 27018 instance killed 2026-05-27)
- **Static client:** served via `static-server.js` on port 5003 alongside Express API

## Source of Truth
- **DB:** `sakshi_spurti` on port 27017 (auth required)
- **Verify SP correctness:** Compare any student's `totalSp` in `students` collection with the sum of `appliedDelta` in `sptransactions` for that email. Also verify leaderboard API (`/api/leaderboard`) returns same `totalSp` values as the `students` collection.
- **To verify new ingestion:** After running `ingestSession`, check that: (a) new session appears in `sessions` collection, (b) transaction count increases, (c) for a sample student, balance in `sptransactions` matches their `totalSp` in `students` table, (d) leaderboard API reflects updated SP

## Known Bugs / Notes
- `deltaMode` validator error: schema expects `'absolute' | 'percentage'`. Using `'percent'` (singular) causes validation failure. Fixed in code — only affects legacy transactions created before the fix (May 26 restart).
- **Percentage SP support:** When a chat SP review is accepted with `% SP` (e.g. +10% SP), `deltaMode` is set to `'percentage'`, `deltaValue` holds the percent (e.g. 10), and `appliedDelta` is computed at accept time as `round(currentBalance * deltaValue / 100)`. This works correctly.

## Current DB State (2026-06-28, after mirror-rubric APPLY)
Scored by `pipeline/sp-rubric-build-mirror.cjs` (`APPLY=1`), covering Day-by-day
mandatory sessions 15 May → 27 Jun (36 qualifying sessions; 26 Jun was a holiday).
- students with totalSp > 0: **3,062**
- sptransactions: **50,700** (categories: initial / attendance / poll only — no
  admin-discretionary txns currently exist)
- sum of all `totalSp`: **657,622**
- Leaderboard #1: **Lakshya Aran — 790 SP** (72 txns, sum == totalSp ✓); top is
  tight, ranks 2–10 within ~21 SP (783 → 769).
- The APPLY cleared **570** previously-scored students who aren't in the new
  ledger (rejected applicants + duplicate person-records consolidated under a
  canonical email + no-longer-qualifying) so the leaderboard has no stale ghosts.
- Integrity verified: per-student `sum(appliedDelta) == totalSp`; ledger balances
  are monotonic cumulative sums; deltas ∈ {0,3,5,10}.
- Pre-APPLY backup: `sp-runs/sp_backup_mirror_2026-06-28T1735Z/`.

### (historical) 2026-05-27 17:30 GMT+5:30
- students: 1,791 (1,313 active, 478 excused); sessions: 19 (15–27 May Morning);
  sptransactions ~47,955. Superseded by the 28 Jun mirror-rubric run above.
- 27 May Morning ingestion: attendance ✅ poll ✅ chat ✅ (429 students got +5 SP from chat)
- 37 peer-escalation SP penalty reviews (camera off) created in `chat_s_p_reviews` — pending admin approval