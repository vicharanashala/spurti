# Summership SP App - How To Use

This folder contains the MERN-based Summership SP analysis app. It runs on localhost, uses local MongoDB, and can restore the included student data from the JSON file in `data/students.json`.

## What This App Shows

- A public landing page explaining Spurti Points.
- Student search by name or email.
- Privacy-safe student lookup:
  - Full email search opens the exact record.
  - Name search shows masked email results.
  - A student must confirm the full email before opening a masked result.
- Student record pages with:
  - Overview
  - SP Bank ledger
  - Attendance
  - Participation
- SP calculation from:
  - Initial credit: `100 SP`
  - Attendance
  - Activity/game participation
  - Chat participation, when chat data is ingested

## Requirements

Install these before running the app:

- Node.js LTS
- npm
- MongoDB Community Server running locally

The default MongoDB connection is:

```bash
mongodb://127.0.0.1:27017/analysis_summership
```

The default app URL is:

```bash
http://localhost:5290
```

Runtime settings are read from environment variables. For local development, copy:

```bash
cp .env.example .env
```

For the `samagama.in` SSH deployment, copy:

```bash
cp .env.ssh.example .env
```

The `.env` file is intentionally ignored by Git, so each machine can keep its own port and MongoDB without changing committed code.

On production, direct student search should stay disabled:

```bash
ALLOW_STUDENT_SEARCH=false
```

Students enter Spurti from their Samagama dashboard. Spurti lives at `samagama.in/spurti` (same origin), so the browser already carries the `chatengine_token` cookie that Samagama validates — Spurti forwards it to Samagama's internal `/api/auth/me` endpoint (`SAMAGAMA_AUTH_URL`) to confirm the session. No token in the URL, no shared secret, no login page.

## Folder Structure

```text
client/                 React frontend
server/                 Express + MongoDB backend
data/
  students.json         Seed data used to recreate student records
  uploads/              Raw attendance/chat files kept for reference and re-ingestion
package.json            Backend/app scripts
```

## Setup After Cloning

From the cloned repo:

```bash
npm run setup
```

Make sure MongoDB is running before running setup or starting the app.

`npm run setup` installs backend dependencies, installs client dependencies, rebuilds MongoDB from the checked-in roster/upload files, and builds the React frontend.

## Load The Same Data Into Local MongoDB

Run this from the repo root:

```bash
npm run rebuild
```

This reads:

```text
data/students-start-on-or-before-2026-05-22.csv
data/uploads/
```

and writes students, sessions, attendance records, chat records, poll records, and SP transactions into:

```text
analysis_summership
```

This is the main step that lets another system clone the repo and reconstruct the same local MongoDB.

Important: `npm run rebuild` clears the Summership collections and rebuilds them from the checked-in files.

## Add New Students Without Rebuilding

When you receive a new or updated student list and want to preserve existing SP transactions, use:

```bash
npm run add-students -- path/to/new-student-list.csv
```

This does not clear the database. It matches existing students by primary or alternate email. Existing students are updated only for roster fields such as name and internship dates. New students are inserted with `100 SP`, and the script creates their first `SPTransaction` as an initial system credit on their internship start date.

## Sync New Student List And Backfill

For normal roster updates, prefer the sync command:

```bash
npm run sync-students -- path/to/new-student-list.csv
```

This does everything `add-students` does, then safely backfills known historical sessions for the synced students only. It skips sessions before each student's internship start date and skips transactions that already exist, so it is safe to rerun.

Students already in MongoDB but missing from the latest synced CSV are not deleted. They are marked `excused`, keep their old SP bank/chats/polls/attendance, and are excluded from active cohort rankings, leaderboards, future session ingestion, and cohort analytics. If an excused student appears in a later roster, `sync-students` reactivates them.

For the checked-in 25 May roster, the command is:

```bash
npm run sync-students -- data/students-start-on-or-before-2026-05-25.csv
```

## Ingest A New Daily Session

When you receive a new attendance/chat/poll file for a day, put the files under `data/uploads/YYYY-MM-DD/`, then run:

```bash
npm run ingest-session -- \
  --label "22 May Morning" \
  --date 2026-05-22 \
  --type morning \
  --attendance data/uploads/2026-05-22/attendance.csv \
  --chat data/uploads/2026-05-22/chat.txt \
  --poll data/uploads/2026-05-22/poll.csv \
  --minutes 120
```

Only `--label` and `--date` are always required. Provide at least one of `--attendance`, `--chat`, or `--poll`. If the attendance CSV has Zoom start/end/duration metadata, the script reads it automatically. Otherwise pass `--minutes`, and optionally `--start` and `--end`.

When a chat file is included, the ingest script also scans for manual SP review items such as `+3 SP`, `-5 sp`, or `awarded +3 bonus points`. These are added to the admin review queue only; they do not change SP until an admin accepts them.

To scan a chat file without ingesting attendance/polls:

```bash
npm run scan-chat-sp -- \
  --label "23 May Morning" \
  --date 2026-05-23 \
  --chat data/uploads/2026-05-23/chat_23_May.txt
```

Admin review flow:

1. Open admin dashboard.
2. Go to `SP Review`.
3. Accept rows that should become SP transactions.
4. Reject warning/noise rows or uncertain matches.

The daily ingestion command creates or updates the session, records attendance/polls/chats, adds missing SP transactions, skips duplicate transactions, and recalculates affected student balances.

## Optional: Rebuild Chat SP From Raw Chat Files

The raw chat files are stored in:

```text
data/uploads/
```

If chat records need to be rebuilt from raw files, run the chat ingestion script after seeding:

```bash
node server/scripts/ingestChat.js data/uploads/2026-05-15/15-may-morning-chat.txt "15 May Morning"
node server/scripts/ingestChat.js data/uploads/2026-05-15/15-may-evening-chat.txt "15 May Evening"
node server/scripts/ingestChat.js data/uploads/2026-05-17/chat.txt "17 May Weekend Special"
```

Only use a chat file for the correct day/session. If a copied chat file belongs to another day, do not ingest it for that session.

## Build And Run

Build the React frontend:

```bash
npm run build
```

Start the MERN app:

```bash
npm start
```

Open:

```bash
http://localhost:5290
```

## Development Run

The backend can be started with:

```bash
npm run dev
```

The React dev server can be started separately from `Summership/client`:

```bash
npm run dev
```

The client dev server uses:

```bash
http://127.0.0.1:5291
```

For normal user testing, prefer `npm run build` and `npm start` from the `Summership` folder so the backend serves the built frontend on one URL.

## SP Rules Currently Used

Initial SP:

```text
100 SP
```

Attendance:

```text
Present for at least 75% of session: +5 SP
Present but less than 75%: 0 SP
Absent: -5 SP
```

Activity/game participation:

```text
Participated and item match is yes: +10 SP
Participated but item match is not yes: +5 SP
No participation: 0 SP
```

Chat participation:

```text
1-2 valid messages in a session: +2 SP
3 or more valid messages in a session: +5 SP
Maximum chat SP per session: +5 SP
```

Short filler messages such as `hi`, `hello`, `yes`, `ok`, and reactions are ignored for chat SP.

## Adding More Data Later

For future days, keep the data day-wise under:

```text
data/uploads/YYYY-MM-DD/
```

Recommended file types:

- Attendance CSV from Zoom participant report
- Chat TXT from Zoom chat export
- Activity CSV or spreadsheet export

After new data is added, the app should ingest it into MongoDB and then use MongoDB as the source of truth. Once data is ingested and verified, the raw files are only needed for audit/rebuild purposes.

## Troubleshooting

If the app opens but no records show:

1. Check MongoDB is running.
2. Run `npm run seed` again from the repo root.
3. Restart the app with `npm start`.

If port `5290` is busy:

```bash
PORT=5292 npm start
```

Then open:

```bash
http://localhost:5292
```

If MongoDB is on another URL:

```bash
MONGO_URI="mongodb://127.0.0.1:27017/analysis_summership" npm start
```
