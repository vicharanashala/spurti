# Spurti Project Context

## Overview
Spurti is a student engagement tracking app for the VLED Summership program at IIT Ropar. It awards SP (Spurti Points) for attendance, poll correctness, peer teaching/learning (SPA), answering peer queries, and ViBe course commitments. (Chat-based SP is a legacy, now-dormant source.)

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

## SP Calculation — band/tier rubric (current, 2026-08)

Implemented in **`pipeline/sp-rubric-build-mirror.cjs`** (the mirror rubric). The
old live-API `pipeline/sp-rubric-build.js` and this repo's `server/scripts/`
CSV/±5 logic are **retired**. All categories are recomputed from scratch on every
run (wipe-and-rebuild) except `manual`/`peer_faq`, which are preserved. Live
categories in `sptransactions`: **`initial`, `attendance`, `poll`, `spa`,
`query`** (plus preserved `manual`). See `pipeline/README.md` for detail.

Common tier ladder used by attendance & poll:
`pct ≥ 90 → +10, 75–89 → +5, 50–74 → +3, < 50 → 0` (positive-only; never negative).

- **Initial:** +100 to every *started intern* on their official start date.
  Future-start interns are zeroed; non-intern roster entries are set aside.
- **Attendance (A):** banded via the tier ladder. Source depends on the date:
  - **Before 2026-07-16 (morning standup):** Zoom presence clipped to
    `[09:05 IST, min(first-instance-end, 11:00 IST)]`.
  - **2026-07-16 … Day 63 (evening on Zoom):** Zoom presence clipped to
    `[20:05 IST, min(picked-mtg-end, 21:00 IST)]`; the scored meeting is the
    mandatory meeting with the **largest overlap** of that window (constants
    `EVENING_CUTOVER`/`EVENING_WSTART_IST`/`EVENING_WEND_IST`).
  - **From Day 64 / 2026-07-29 (evening on Spandan — HYBRID):** no Zoom room, so
    attendance is derived from **Spandan poll correctness**:
    `attendedMinutes = min(60, round(correct / pollsLaunched × 100))` (≈60% correct
    = a full 60-min session), then the tier ladder on `minutes/60`. Special
    no-poll nights (V-Talks, celebrations) fall back to Zoom presence in an
    official `SPECIAL_WINDOW_IST` window. Constant: `ATT_HYBRID_CUTOVER`.
    Minutes feed `attendancerecords` (the My-Journey 3,600-min goal) via
    `sync-attendance-records.cjs` parsing the `present X of Y min (Z%)` reason.
- **Poll (B):**
  - **From 2026-07-16 (Spandan):** correctness **percentiled to the day's top
    scorer** — `pct = pointsEarned / dayTopPoints × 100`, then the tier ladder.
    Source: `spandan_polls` (mirrored from the Spandan Research API by
    `spandan-poll-fetch.cjs`).
  - **Before 2026-07-16:** `pct = answered / totalQuestions` from the frozen
    `zoom_polls` mirror (participation), unchanged as history has it.
- **SPA (peer teaching/learning):** from **validated** `act_spa_endorsements`
  (status `approved`/`audit_passed`): **+5/learned question (cap 50)** and
  **+8/peer taught (cap 30)**. A confirmed-fraud or failed-audit flag applies a
  penalty (−50% / −20% of current SP). `category:'spa'`.
- **Query answering:** **+5 per DISTINCT peer query answered** (from
  `act_query_reviews.peer.submittedAnswerHistory`), self-answers excluded,
  **capped at 200 SP/student**; answers with `peer.review.action` of
  `rejected`/`marked_unworthy` earn nothing. `category:'query'`.
- **Grace day 2026-06-06:** 1-min join = full attendance + full poll.
- **Chat / discretionary:** legacy ChatSPReview flow; **dormant** (`chatrecords`
  empty, no chat SP awarded).

**Beyond the ledger (web app, not `sptransactions` categories):** ViBe **stake
commitments** (bet SP on a course %-by-deadline; win/lose the stake), **My
Journey** goals incl. the **3,600-min standup goal**, **Levels / Trophy Leagues /
Legend** (derived by `sync-levels.cjs`), and the **SP trajectory** snapshot.

## Leaderboards — cached boards

Replaces the old single all-time list. Curated boards are **precomputed** into
`leaderboardsnapshots` (one doc per board, holding the FULL sorted list so the API
can return the top 50 AND the caller's own rank even outside it):
- **Windows:** `week` (fixed **Mon 00:00 IST reset**) and `all` (all-time).
- **Categories:** `total` + per-category `attendance` / `poll` / `spa` (combined
  learn+teach) / `query`. Weekly boards rank by SP *earned in the window*;
  the weekly **total** board excludes the `initial` joining grant
  (`WEEKLY_EXCLUDED_CATEGORIES`) — it is awarded for starting, not for anything
  done, and a mid-week joiner would otherwise top the board on +100 alone ahead
  of people who actually earned. All-time is unaffected (it reads `totalSp`);
  category boards by SP *from that category*; all-time-total by `students.totalSp`.
- **Scope:** global, plus **cohort** (onboarding `leaderboardGroup`) for the total
  board.
- **No email** on student-facing boards (name + level + SP only).

Built by `server/services/leaderboards.js` (`computeAndStoreLeaderboards`) via
`server/scripts/buildLeaderboards.js`, wired into `sp-refresh.sh` (step 3b) — so
boards are never staler than the SP data. Served by
`GET /api/leaderboard/board?window&category&scope` → `{ rows: top50, me: {rank,sp} }`.
Client: `LeaderboardPanel` (a preset dropdown). Population = `activeFilter`
(`status ≠ excused`), identical to the rest of the app.

> NOTE: session labels are now `Day N (DD Mon)` / `Orientation (15 May)`
> (produced by the pipeline), NOT the old `"15 May Morning"` form still listed
> in `server/config.js SESSION_LABELS`. The retired ±5 display service
> (`server/services/sp.js`) that iterated the old labels was deleted on
> 2026-08-10; the My Journey/standup/level views all read the modern labels.

## Achievements — permanent cards + public verify (env-gated)

A student **Achievements tab** of permanent, once-earned cards, each shareable as
a PNG carrying a QR to a public verify page.

- **`achievements` collection** — one row per achievement, unique on
  `(studentId, achId)`. Two kinds: **rank** (1st/2nd/3rd on a global board,
  awarded by the leaderboard build; a weekly win carries its week in the `achId`,
  so taking the same board in a later week is a new card) and **milestone**
  (Legend ≥1500 highest-ever SP, Level 5/10/15/20/25, the 3,600-minute club),
  settled and persisted on read in `server/services/achievements.js`.
- Every row gets a **`verifyId`** (`SPRT-XXXX-XXXX`, ambiguity-free alphabet).
  `GET /spurti/verify/:code` is a **public, no-login** page — name, what was won,
  when, nothing else — and the card's QR points at it. The page is served with
  og: tags so a posted link expands into a preview of the card; that preview
  image is the PNG the browser hands back via `POST /api/share/card`, stored
  under `CARD_DIR` (default `server/data/cards`, regenerable).
- **The code is uniqueness-critical, and the index is what guarantees it.** It is
  public (printed on the card, in the QR, in the caption), so it must be
  unguessable but never secret. A duplicate would credit the wrong student on the
  verify page *and* overwrite their `{verifyId}.png`. `verifyId` therefore carries
  a **unique partial index**, and `awardAchievements()` in `models/Achievement.js`
  re-rolls on `E11000`. Randomness alone only makes a clash unlikely.
  **Run `server/migrations/2026-08-12-unique-verify-id.mjs --apply` before
  deploying** — the collection already has a non-unique `verifyId_1` from the
  first release, and Mongo will not redefine an index that keeps its name and
  changes its options. Mongoose swallows that failure at boot, so skipping the
  migration leaves the app running with no guarantee and no error.
- **`shareevents`** logs every share/download/copy. The achievement's category
  (`kind`, `board`, `place`, `period`, `periodKey`, `earnedAt`) is **copied onto
  the event** so share-rate-by-category is a group-by rather than a join, and so
  the record survives any later change to a title or a board's wording.
- **`achievementviews`** logs hits on the public verify page — the only reach
  measure the feature has. Crawler hits are flagged (`bot`) and excluded from
  every reported figure, because LinkedIn fetches each shared URL to build its
  preview and would otherwise manufacture its own audience. Viewers are members
  of the public, not participants: **no IP, no cookie, no full referrer** is
  stored. `viewerDay` is an HMAC of IP+UA under an in-memory salt that rotates
  daily and is never persisted, so same-device hits collapse for a distinct count
  but nobody can be identified or followed across days.
- Both are surfaced on the admin **Achievements** tab (`/api/admin/analytics` →
  `sharing`). Every rate there divides by cards **held**, never by share actions.

**Env switches** (repo-root `.env` — the app's cwd is the repo root; all default
OFF, so the feature ships dark):

| var | effect |
| --- | --- |
| `ACHIEVEMENTS_ENABLED=1` | tab visible to the whole cohort. **Also** turns on tie-aware "1224" ranking in the leaderboard build and the minting of podium cards — with it off, the build ranks 1,2,3… exactly as before and awards nothing. |
| `ACHIEVEMENTS_EMAILS=a@b.com,…` | named accounts see the tab while it is otherwise off (preview on live data) |
| `ACHIEVEMENTS_SHARING=1` | Share/Download buttons, and the `share/card` + `share/track` endpoints. Requires the tab to be visible; never the other way round |
| `ALERT_WEBHOOK_URL=…` | where sp-refresh POSTs an alert when a step fails twice running (see below). Unset = the alert only reaches `logs/sp-refresh.log` and the admin dashboard |
| `ALERT_WEBHOOK_SECRET=…` | shared secret sent in the alert body, same pattern as the survey Apps Script endpoints |
| `VERIFY_VIEW_LOG=0` | turns OFF verify-page view logging (defaults ON). The one switch here that defaults on, because the log is what makes reach measurable at all |

**When podium cards are awarded.** Weekly cards come from the **last completed
week**, never the one in progress. Awarding live only looked idempotent: the
upsert is keyed on `(studentId, achId)` and `achId` carries no student, so a new
leader at the next six-hourly run was handed their *own* row rather than
replacing the previous holder — up to 28 students could each hold a permanent,
independently verifiable "1st place, week of X" card for the same board. A
finished week cannot move, so awarding from it yields one set of winners.

A settled-placing guard backs this up: once a placing has any holder it is
closed. Ties still work, since they are awarded together in one batch, but a
later challenger cannot claim a title already issued — including after a
backdated transaction shifts a past week's standings.

**All-time boards are not awarded as podiums at all.** They never settle while
the programme runs, so an unqualified "1st place, All-time" would go to every
successive leader in turn. Instead the top spot is a **dated reign**, recorded in
`boardreign` (`board`, `studentId`, `from`, `to`, `peakSp`, `awarded`): "top of
the Overall board, 15 Jul – 12 Aug 2026" is true of each holder, the spans do not
overlap, and nobody's card is revoked when they are overtaken.

- **1st only.** "Reigning champion" is a real idea; "was second for a while" is
  not, and the places below the top shuffle constantly.
- **A reign earns a card after 7 days.** The build runs four times a day and the
  lead can change between runs early in a cohort, so without a floor a six-hour
  blip would mint a permanent credential. Short reigns are still recorded — that
  history is the only measure of leadership churn the programme has.
- **Cards are minted while the reign is open**, reading "Since 15 Jul 2026", and
  gain their end date when it closes. The PNG already posted keeps the older
  wording, which was true when posted; the verify page stays current.

Flipping any of them is a `.env` edit + PM2 restart — no rebuild, no redeploy.

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
- **2026-07-16 standup moved morning → evening (attendance window fix).** Students
  flagged that the 16 Jul evening standup (~60 min) credited "115 min". Cause was
  NOT double-counting: the scorer clipped presence to the fixed **09:05–11:00 IST
  (=115 min) morning window**, which no longer matched the standup. The persistent
  Zoom room `95674128668` ("Evening Standup") stays open all day, so it satisfied
  the old morning window. Fix: added an evening-window cutover (see SP Calculation
  section) → from 16 Jul the window is **20:05–21:00 IST (55 min)** and the scorer
  picks the max-overlap meeting. Re-scored + APPLIED 2026-07-17 09:17Z
  (backup `sp-runs/sp_backup_mirror_2026-07-17T0917Z`; script backup
  `pipeline/sp-rubric-build-mirror.cjs.bak.20260717T091026Z`). Impact on 16 Jul:
  493 students ↑ (mostly 0→+10, real evening attendees who'd been under-credited),
  35 ↓ (incl. ~20 who only idled in the morning room, 10→0), 204 unchanged.
  Dates before the cutover use the identical old code path (no historical change).
- `deltaMode` validator error: schema expects `'absolute' | 'percentage'`. Using `'percent'` (singular) causes validation failure. Fixed in code — only affects legacy transactions created before the fix (May 26 restart).
- **Percentage SP support:** When a chat SP review is accepted with `% SP` (e.g. +10% SP), `deltaMode` is set to `'percentage'`, `deltaValue` holds the percent (e.g. 10), and `appliedDelta` is computed at accept time as `round(currentBalance * deltaValue / 100)`. This works correctly.

## Current DB State (2026-08-04)
Scored by `pipeline/sp-rubric-build-mirror.cjs` (`APPLY=1`), refreshed on the
6-hourly `sp-refresh.sh` cron. Ballpark live figures:
- students with `totalSp` > 0: **~3,843**
- `sptransactions`: **~92,060** (categories: `initial`, `attendance`, `poll`,
  `spa`, `query`)
- sum of all `totalSp`: **~1,173,000**
- Leaderboard #1: **Aman Jaiswal — 1,859 SP**
- Integrity invariant still holds: per-student `sum(appliedDelta) == totalSp`.

### (historical) 2026-06-28, after mirror-rubric APPLY
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

## Pipeline alerting

`sync-attendance-records` failed **31 runs in a row over eight days** and nobody
noticed: it is non-fatal by design, and the only trace was one line per run in a
4,700-line log. Non-fatal must not mean invisible.

Every step in `sp-refresh.sh` now runs through `run_step`, which writes
`logs/step-health.tsv` (`name / status / lastRun / consecutiveFailures / lastOk`),
and after **two consecutive failures** logs `!!! ALERT: …` and POSTs
`ALERT_WEBHOOK_URL`. Success resets the counter. Fatal vs non-fatal is unchanged
— `rubric APPLY` and `sync-levels` still abort the run.

The same file is served at `/api/admin/analytics` → `pipeline` and rendered as a
**Pipeline health** table on the admin Analytics tab, red once a step is alerting.

**The box cannot send email itself** — no MTA, no local SMTP, no mail library, no
credentials, and cron has no `MAILTO`. So alerts leave via a webhook. The intended
target is a **Google Apps Script web app**, which this project already uses for
the survey sheet sync: it runs as the owner, so `MailApp.sendEmail()` sends from
their own account and **no mail password is ever stored on the server**. Slack or
Discord webhooks work equally well — the body is
`{ secret, host, text }`.

```javascript
// Apps Script: Deploy > New deployment > Web app, execute as me, anyone can access.
function doPost(e) {
  var p = JSON.parse(e.postData.contents);
  if (p.secret !== 'PUT_THE_SAME_SECRET_AS_ALERT_WEBHOOK_SECRET_HERE') {
    return ContentService.createTextOutput('no');
  }
  MailApp.sendEmail({
    to: 'imsakshivk@gmail.com',
    subject: '[Spurti] pipeline alert on ' + p.host,
    body: p.text
  });
  return ContentService.createTextOutput('ok');
}
```

The POST is best-effort with a 15s timeout: an alerting channel must never be the
reason a scoring run hangs or fails.
