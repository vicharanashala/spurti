# Spurti Project Context

## Overview
Spurti is a student engagement tracking app for the VLED Summership program at IIT Ropar. It tracks student attendance, polls, chat participation, and awards SP (Spurti Points).

## Running
- **Production:** `https://samagama.in/spurti/`
- **Dev server:** `cd /Users/sakshivk/sakshigit/spurti && node server/server.js`
- **Port:** 5003
- **MongoDB:** `sakshi_spurti` on `127.0.0.1:27017` (auth: sakshi/iitropar, authSource: sakshi_spurti)

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

## Key Scripts

### ingestSession
Daily session ingestion — attendance, chat, poll SP, creates ChatSPReview reviews for admin.
```bash
npm run ingest-session -- --label "23 May Morning" --date 2026-05-23 \
  --start 2026-05-23T09:00:00 --end 2026-05-23T11:01:41 --minutes 122 \
  --attendance data/uploads/2026-05-23/23_May_Attendance.csv \
  --chat data/uploads/2026-05-23/chat_23_May.txt \
  --poll data/uploads/2026-05-23/poll_23_May.csv
```

### syncStudents
Full roster sync + all sessions. Marks absent students as excused.
```bash
npm run sync-students -- path/to/roster.csv
```

### rebuild
Full database rebuild. DELETES and recreates sessions, attendance, polls, chats.
Modified to SKIP Student delete/insert (students already seeded via seed-students.js).

## Data Sources (data/uploads/<date>/)
- Attendance: Zoom export CSVs
- Chat: Plain text chat logs
- Polls: Zoom poll CSVs

## SP Calculation
- Initial: 100 SP per student
- Attendance: +5 if ≥75% attendance, -5 otherwise
- Poll: +1 per attempted question, -1 per missed question
- Chat: +5/-5 based on sentiment scoring (admin review via ChatSPReview)

## Admin Endpoints
- `GET /api/leaderboard` — SP rankings
- `GET /api/admin/chat-sp-reviews` — pending reviews
- `POST /api/admin/chat-sp-reviews/:id/accept` — award SP
- `POST /api/admin/chat-sp-reviews/:id/reject` — reject

## Auth
- Cookie: `spurti_student` (signed JWT/HS256)
- Handoff: `GET /spurti/auth?token=<signed_payload>` sets the cookie
- Token format: `base64url(JSON({email, exp}))` signed with `SPURTI_AUTH_SECRET`

## Server Info (samagama.in)
- **SSH:** `ssh sakshi@samagama.in` (Mac SSH key)
- **SSH path:** `/home/sakshi/spurti` — prod app, port 5003
- **MongoDB:** `sakshi_spurti` on `127.0.0.1:27017` (auth: sakshi/iitropar, authSource=sakshi_spurti) — **THIS IS THE SOLE SOURCE OF TRUTH**
- **Workspace copy:** `/var/samagama/spurti-workspace/spurti` (NOT active, no longer has separate MongoDB — 27018 instance killed 2026-05-27)
- **Static client:** served via `static-server.js` on port 5003 alongside Express API

## Source of Truth
- **DB:** `sakshi_spurti` on port 27017 (auth required)
- **Verify SP correctness:** Compare any student's `totalSp` in `students` collection with the sum of `appliedDelta` in `sptransactions` for that email. Also verify leaderboard API (`/api/leaderboard`) returns same `totalSp` values as the `students` collection.
- **To verify new ingestion:** After running `ingestSession`, check that: (a) new session appears in `sessions` collection, (b) transaction count increases, (c) for a sample student, balance in `sptransactions` matches their `totalSp` in `students` table, (d) leaderboard API reflects updated SP

## Known Bugs / Notes
- `deltaMode` validator error: schema expects `'absolute' | 'percentage'`. Using `'percent'` (singular) causes validation failure. Fixed in code — only affects legacy transactions created before the fix (May 26 restart).
- **Percentage SP support:** When a chat SP review is accepted with `% SP` (e.g. +10% SP), `deltaMode` is set to `'percentage'`, `deltaValue` holds the percent (e.g. 10), and `appliedDelta` is computed at accept time as `round(currentBalance * deltaValue / 100)`. This works correctly.

## Current DB State (2026-05-27 17:30 GMT+5:30)
- students: 1,791 (1,313 active, 478 excused)
- sessions: 19 (15 May – 27 May Morning)
- sptransactions: ~47,955 (3,059 from 27 May Morning: 1,315 attendance + 1,315 poll + 429 chat)
- 37 chat SP reviews created in `chat_s_p_reviews` collection (camera-off penalties, pending approval, for 27 May Morning)
- All sessions through 27 May Morning verified: leaderboard SP matches students.totalSp ✅ (verified ALLU: 323 SP, calculated from tx = 323 SP = students.totalSp ✓)
- 27 May Morning ingestion: attendance ✅ poll ✅ chat ✅ (429 students got +5 SP from chat)
- 37 peer-escalation SP penalty reviews (camera off) created in `chat_s_p_reviews` — pending admin approval