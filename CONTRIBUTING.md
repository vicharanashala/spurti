# Contributing to Spurti

## Quick Links

- [Codebase Overview](#codebase-overview)
- [Development Setup](#development-setup)
- [Running the App](#running-the-app)
- [Project Structure](#project-structure)
- [Key Conventions](#key-conventions)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

---

## Codebase Overview

Spurti is a student engagement tracking app for the VLED Summership program at IIT Ropar.

The system has two distinct parts:

| Directory | Role |
|-----------|------|
| `server/` | Express API + React SPA (this repo). **Read-only** consumer of MongoDB. |
| `pipeline/` | The SP scoring engine that **writes** to the database. Runs on the samagama server via cron. |

The two communicate **only** through the shared MongoDB database (`sakshi_spurti`). The web app never computes SP — it only reads what the pipeline writes.

---

## Development Setup

### Prerequisites

- **Node.js** ≥ 22.0.0
- **MongoDB** running locally (or a dev URI)
- **npm**

### 1. Clone and install

```bash
git clone https://github.com/<your-fork>/spurti-iit-ropar-vled-.git
cd spurti-iit-ropar-vled-
npm install
cd client && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set your MONGO_URI and ADMIN_TOKEN
```

**Important:** The default `MONGO_URI` in `.env.example` uses `spurti_dev`. Production uses `sakshi_spurti`.

Generate a secure admin token:
```bash
openssl rand -hex 32
```

### 3. Build the client

```bash
npm run build
```

---

## Running the App

### Development mode (auto-reload)

```bash
npm run dev
# Server runs on http://localhost:5290
```

### Production mode

```bash
npm run build   # build client
npm start       # start server on PORT (default 5290, or from .env)
```

### Run tests

```bash
npm test
```

### Syntax check

```bash
npm run lint
```

---

## Project Structure

```
.
├── server/
│   ├── server.js          # Express app + all API routes
│   ├── config.js          # Environment config + SESSION_LABELS (legacy)
│   ├── models/            # Mongoose schemas
│   │   ├── Student.js
│   │   ├── SPTransaction.js
│   │   ├── Session.js
│   │   ├── AttendanceRecord.js
│   │   ├── PollRecord.js
│   │   ├── SessionEvent.js
│   │   └── AnalyticsSnapshot.js
│   ├── services/          # Business logic
│   │   ├── levels.js      # SP → level/league/badge derivation (pure functions)
│   │   ├── spLedger.js    # Student ledger from transactions
│   │   ├── sp.js          # SP breakdown computation (⚠ legacy — not used by routes)
│   │   └── analyticsService.js  # Analytics snapshots (⚠ legacy)
│   ├── utils/             # Shared utilities
│   │   ├── email.js       # normalizeEmail, maskEmail
│   │   ├── validators.js  # Zod schemas + middleware
│   │   └── parse.js       # CSV/date parsing
│   ├── scripts/           # One-time / admin scripts (legacy — see below)
│   │   ├── addStudents.js         # Upsert students from CSV
│   │   ├── syncStudents.js        # Full roster sync + session apply
│   │   ├── seed.js                # Seed from students.json
│   │   └── lib/ingestion.js       # Shared CSV/ingestion utilities
│   └── __tests__/         # Jest tests
│
├── client/
│   ├── src/main.jsx       # Single-file React app (landing, student, admin views)
│   └── vite.config.js
│
├── pipeline/              # ⚠ Lives on samagama server, not this repo
│   ├── sp-rubric-build-mirror.cjs  # Authoritative SP scorer
│   ├── zoom-update.js              # Zoom data ingestion
│   └── sync-*.js                   # DB sync scripts (hardcoded prod paths)
│
└── data/                  # CSV/JSON seed data + exports
    ├── students-start-on-or-before-*.csv
    └── exports/
```

### Legacy scripts — do not run for scoring

The `server/scripts/` directory contains the **old CSV-based scoring pipeline** (the ±5 per session model). This is **superseded** by `pipeline/sp-rubric-build-mirror.cjs`, which is the authoritative scorer.

Only run these if you know what you're doing:
- `npm run add-students` — safe, upserts students from CSV
- `npm run sync-students` — full roster sync (legacy)
- `npm run seed` — seeds from `data/students.json` (old schema)

---

## Key Conventions

### Database field names

| What | Field | Notes |
|------|-------|-------|
| Transaction amount | `appliedDelta` | **Not `delta`** |
| Transaction time | `dateTime` | **Not `sessionDatetime`** |
| Running balance | `balanceAfter` | Pre-computed on each transaction |

### Session labels

The **pipeline** (authoritative) produces labels in format:
- `"Day N (DD Mon)"` — e.g., `"Day 1 (16 May)"`
- `"Orientation (DD May)"` — e.g., `"Orientation (15 May)"`

The **server config** (`server/config.js`) still has the old format (`"15 May Morning"`). This is a known desync bug. Use the pipeline format for any new work.

### SP scoring rules

| Component | Rule |
|-----------|------|
| Initial | +100 to every started intern on their start date |
| Attendance | ≥90% → +10, 75-89% → +5, 50-74% → +3, <50% → 0 |
| Poll | Same band ladder |
| Chat | Dormant — not currently awarded |

### Auth

The app uses Samagama's `chatengine_token` cookie. No login page — students open `/spurti` from their Samagama dashboard. The server validates against Samagama's internal auth endpoint.

Admin access requires `X-Admin-Email` + `X-Admin-Token` headers.

---

## Testing

```bash
npm test
```

Tests live in `server/__tests__/`. Currently covers validators and email utils.

---

## Submitting Changes

1. **Fork** the repository
2. **Create a branch** — `git checkout -b fix/my-fix` or `git checkout -b feature/my-feature`
3. **Make your changes** — follow the conventions above
4. **Run tests** — `npm test` and `npm run lint`
5. **Push to your fork** — `git push origin fix/my-fix`
6. **Open a Pull Request** — describe what changed and why

### What makes a good PR

- One logical change per PR (don't mix bug fixes with refactors or UI changes)
- Clear description of what was fixed and how to verify
- If fixing a bug, explain the root cause
- If adding a feature, explain the use case
- Keep diffs small and readable

### Coding standards

- Use ES modules (`import`/`export`)
- No `console.log` in production code — use a logger if needed
- Validate all input with Zod schemas (already set up in `utils/validators.js`)
- Don't introduce new hardcoded values — use environment variables or config
- Don't commit secrets or credentials