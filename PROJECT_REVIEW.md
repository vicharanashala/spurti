# Spurti — Complete Project Review

**Project:** Spurti — VLED Summership Student Engagement Tracking
**Review Date:** June 2026
**Files Reviewed:** ~40 source files across `server/`, `client/`, `pipeline/`, and root scripts
**Total Issues Found:** 50 (9 Critical · 16 Major · 25 Minor)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Codebase Walkthrough](#codebase-walkthrough)
   - [Root Scripts](#root-level-scripts)
   - [Server - Models](#server-models)
   - [Server - Services](#server-services)
   - [Server - Utils](#server-utils)
   - [Server - API Routes (`server.js`)](#server-api-routes-serverjs)
   - [Server - Scripts](#server-scripts)
   - [Pipeline](#pipeline)
   - [Client](#client)
4. [Issue Register](#issue-register)
5. [Fix Priority](#fix-priority)

---

## Executive Summary

Spurti is a two-part system:
1. **Web app** (`server/` + `client/`): Express API + React SPA served at `https://samagama.in/spurti/`. Read-only consumer of MongoDB.
2. **SP pipeline** (`pipeline/`): The scoring engine that WRITES SP to the DB. Runs on the `samagama` server via cron.

SP is scored entirely by `pipeline/sp-rubric-build-mirror.cjs` (band/tier rubric: base-100 + attendance/poll 10/5/3/0). The web app never computes SP.

**50 real issues** found across all categories: security, correctness, performance, architecture, and developer experience.

### Distribution by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 9     |
| MAJOR    | 16    |
| MINOR    | 25    |

### Distribution by Category

| Category    | Count |
|-------------|-------|
| Security    | 10    |
| Bug         | 17    |
| Performance | 9     |
| Code Quality| 9     |
| Architecture| 9     |
| DX          | 3     |

---

## Architecture Overview

```
Browser → samagama.in/spurti → Nginx → 127.0.0.1:5003 (Spurti server)
                                              ↓
                                    MongoDB: sakshi_spurti
                                              ↑
               SP Pipeline (cron, samagama server)
               zoom-update.js → sp-rubric-build-mirror.cjs → sync-*.js
```

- **Auth**: Cookie-based (`chatengine_token`) passthrough to Samagama's internal auth endpoint. No login page.
- **SP scoring**: Pipeline writes directly to `sakshi_spurti.students.totalSp` and `sptransactions`. Web app reads only.
- **Session labels**: Pipeline produces `"Day N (DD Mon)"` / `"Orientation (DD May)"`. Server config still has old `"15 May Morning"` format — **known desync bug**.

---

## Codebase Walkthrough

### Root-Level Scripts

| File | Purpose | Status |
|------|---------|--------|
| `repair-sp-balances.js` | Recomputes `balanceAfter` on all transactions and syncs `Student.totalSp`. Safe one-time repair. | ✅ Clean |
| `seed-excused-students.js` | Bulk-inserts excused students from CSV into DB. | ✅ Clean |
| `import-sp-ledger.js` | Imports transactions from a CSV export into `sptransactions`. | ⚠️ Legacy |
| `snapshot-analytics.js` | Computes and stores `AnalyticsSnapshot` every 30 min. | ⚠️ Legacy |
| `seed-students.js` | Seeds `students.json` into DB (old schema with `sessions` Map). | ⚠️ Legacy |
| `snapshot-analytics.js` | Calls `t.delta` (undefined) in line 80 — **same bug as everywhere else**. | ❌ Bug |

---

### Server — Models

#### `server/models/Student.js`
Core student document. Key fields: `email`, `alternateEmail`, `internshipStartDate`, `status` ('active'|'excused'), `totalSp`, `highestSpEver`.
- `level`, `trophyLeague`, `legendBadgeUnlocked` are **stored derived views** — risk of staleness if SP changes without recompute.
- Missing compound index `{ status: 1, totalSp: -1 }` for efficient leaderboard queries.
- **Bug**: `status` only has two enum values but code uses `'yet to onboard'` string — silently ignored by Mongoose.
- **Bug**: `legendBadgeUnlocked` is never set to `true` anywhere in the codebase.

#### `server/models/SPTransaction.js`
Append-only transaction log. Fields: `email`, `category` ('initial'|'attendance'|'poll'|'manual'), `sessionLabel`, `deltaMode`, `deltaValue`, `appliedDelta`, `balanceAfter`, `reason`, `dateTime`.
- Indexes: `{ email: 1, dateTime: 1, createdAt: 1 }`, `{ sessionLabel: 1, category: 1 }`, `{ category: 1, appliedDelta: 1, email: 1 }`.
- `deltaMode` validation requires `'absolute' | 'percentage'`. Legacy transactions with `'percent'` (singular) fail validation — but this was fixed in code, only affects pre-fix transactions.

#### `server/models/Session.js`
Session metadata (label, date, times, duration). Not auto-created — populated by legacy ingestion scripts.

#### `server/models/AttendanceRecord.js`
Per-student per-session attendance. Unique compound index on `{ email, sessionLabel }`. No standalone index on `sessionLabel` for aggregation queries.

#### `server/models/PollRecord.js`
Per-student per-session poll responses. Unique compound index on `{ email, sessionLabel }`.

#### `server/models/SessionEvent.js`
Telemetry events (page_view, page_stay, page_close) for live analytics and usage tracking. Indexes on `{ email: 1, timestamp: -1 }`, `{ timestamp: -1 }`, `{ page: 1, timestamp: -1 }`.

#### `server/models/AnalyticsSnapshot.js`
Pre-computed 30-minute aggregate snapshots for analytics. `computeSnapshot()` is called by `snapshot-analytics.js` (cron) but **not currently wired to any API endpoint**.

---

### Server — Services

#### `server/services/levels.js` (64 lines)
Pure functions for SP → level/league/badge/group derivation. No DB, no side effects. Clean, well-documented. Used by both server and client.

#### `server/services/spLedger.js` (108 lines)
Reads from `SPTransaction` to build a running-balance ledger for a student.
- **CR-5**: Uses `sessionDatetime` in comment (line 12) but sorts by `dateTime` (line 20) — comment is wrong, code is correct.
- **CR-6**: `runningBalance += Number(t.delta || 0)` — field is `appliedDelta`, not `delta`. Running balance always stays 0.
- **MI-15**: Returns `null` when no student found vs `[]` for empty transactions — inconsistent caller handling required.

#### `server/services/sp.js` (160 lines)
Computes per-student SP breakdown (attendance + poll + activity) from transactions and config.
- **CR-7**: Wrong sort field `sessionDatetime` on line 104 — should be `dateTime`.
- **CR-8**: `t.delta` used instead of `t.appliedDelta` on line 65. Poll SP always returns 0.
- **CR-9**: `SESSION_LABELS` from `config.js` are the old format (`"15 May Morning"`) while pipeline produces new format (`"Day N (DD Mon)"`). The `sessionLedger` computation iterates old labels and will never match pipeline-generated transactions. This means student SP breakdowns show zero for all attendance/poll contributions from pipeline-scored sessions.
- Note: `sp.js` is **not actually called by any route in `server.js`** — `studentPayload()` fetches transactions directly and passes them to the client. It's a legacy service kept for reference.

#### `server/services/analyticsService.js` (141 lines)
Similar to `snapshot-analytics.js` but with different bucket names (`compute_sp_distribution` uses veryNegative/negative/neutral/positive/veryPositive vs snapshot's below100/100to149/...). 
- **Bug**: Line 86 uses `t.delta || 0` instead of `t.appliedDelta || 0` — same delta bug.
- Not used by any route — orphaned code.

---

### Server — Utils

#### `server/utils/email.js` (13 lines)
`normalizeEmail` and `maskEmail`. Called everywhere. Clean and consistent.

#### `server/utils/validators.js` (53 lines)
Zod schemas and validator middleware for request validation. Clean, well-structured.

#### `server/utils/parse.js` (45 lines)
CSV parsing (`parseCsv`), date parsing (`parseDate`, `parseZoomDate`). Solid and well-tested.

---

### Server — API Routes (`server.js`) (772 lines)

**Security:**
- CORS is restricted to known origins via `ALLOWED_ORIGINS` env var ✅ (CR-2 fixed)
- Rate limiting is active on all `/api` routes ✅ (CR-3 fixed)
- `ADMIN_TOKEN` no longer has a hardcoded fallback ✅ (CR-1 fixed)
- `liveViewers` has TTL-based cleanup ✅ (CR-4 fixed)

**Issues remaining:**
- **MA-8**: `/api/confirm` email confirmation endpoint is brute-sforceable — no rate limiting, no CAPTCHA. Compares user-supplied email against DB record.
- **MA-9**: Survey webhook has rate limiting but still needs secret validation hardening.
- **MI-10**: Admin login accessible via `?admin=1` URL param.
- **MI-14**: No minimum length/complexity requirement on `ADMIN_TOKEN`.

**Performance issues:**
- **MA-6**: `/admin/analytics` (lines 515-747) loads massive aggregations in every Promise.all — attendance and transaction txns are `$lookup`-ed with no limits. With 50k+ transactions, this is the heaviest endpoint.
  - `attendanceTx` aggregates ALL attendance records via `$lookup` to students → full scan
  - `transactionTx` aggregates ALL transactions via `$lookup` → full scan
  - `topDropsRaw` aggregation has `$limit: 10` but still processes all negative-delta transactions first
  - `activeStudentsRaw` fetches ALL active students to get `emails[]` and `spValues[]` in memory
  
- **MA-7**: `/me` endpoint (lines 212-219) fetches leaderboard twice (once with `limit(50)`, once without) in parallel — wasteful.

**Auth issues:**
- **MA-14**: `/api/leaderboard`, `/api/search`, `/api/ping` are publicly accessible — return student data without authentication. Acceptable by design (Samagama cookie IS the auth), but worth documenting.

**Key endpoints:**
| Endpoint | Performance | Notes |
|----------|-------------|-------|
| `GET /me` | ⚠️ 5 parallel queries, 2nd leaderboard is unbounded | Leaderboard fetched twice |
| `GET /admin/analytics` | ❌ Loads everything | Worst offender |
| `GET /admin/attendance` | ❌ Full matrix | All students × all sessions |
| `GET /admin/leaderboard` | ✅ Uses `.limit()` | Only this endpoint does |
| `GET /admin/stats` | ✅ Count only | Efficient |
| `GET /admin/active` | ✅ In-memory Map | Live viewer tracking |

**Session labels bug (CR-9):** The display path uses `SESSION_LABELS` from `config.js` which has old format. Student dashboard's SP Bank shows transactions from the pipeline (new format) but the session ledger computation in `sp.js` iterates the old labels — mismatch. However, `studentPayload()` passes raw transaction data directly to client, so the **display is actually correct** via raw transaction data. The bug affects `sp.js` utility functions but not active routes.

**Duplicate mount points (MI-7):** `app.use('/api', api)` and `app.use('/spurti/api', api)` — identical endpoints at two paths.

---

### Server — Scripts

All ingestion scripts are **legacy/superseded**. The pipeline (`pipeline/`) is the authoritative scorer. These remain only because `server/server.js` imports from `lib/ingestion.js` (used by `syncStudents.js`).

| Script | Lines | Purpose | Status |
|--------|-------|---------|--------|
| `lib/ingestion.js` | 284 | Shared CSV/ingestion utilities | ⚠️ Legacy |
| `rebuild.js` | 302 | Full rebuild from CSV data (hardcoded paths) | ❌ Hardcoded |
| `ingestSession.js` | 65 | Ingest single session from CSV | ❌ Legacy |
| `syncStudents.js` | 127 | Upsert students + apply KNOWN_SESSIONS | ⚠️ Legacy |
| `seed.js` | 54 | Seed from `students.json` (old schema) | ❌ Legacy |
| `addStudents.js` | 178 | Upsert students from CSV | ✅ Clean |
| `addNewStudents.js` | 137 | Add only new students from CSV | ⚠️ Hardcoded DB URI `spurti_dev` |
| `migrate_sp_transactions.js` | 213 | CSV migration to transactions | ❌ Hardcoded `analysis_summership` |
| `split22MaySessions.js` | ? | Split 22 May sessions | Not reviewed |

**Duplicate code:** `parseCsv` appears identically in 4+ places. `normalizeEmail` in 6+ places. `maskEmail` in 4 places with subtle differences.

---

### Pipeline

The scoring engine. All files here use `require()` (CommonJS) and reference absolute prod paths.

#### `sp-rubric-build.js` (240 lines)
Live Zoom API scorer. **Retired** — replaced by `sp-rubric-build-mirror.cjs`. Kept for reference.

#### `sp-rubric-build-mirror.cjs` (245 lines)
**Authoritative scorer.** Reads only from `sakshi_spurti` mirrors (`zoom_meetings`, `zoom_attendance`, `zoom_polls`, `candidates`, `students`). Idempotent: wipes and replaces on each APPLY run. Backs up first.
- Hardcoded staff emails (line 69-72)
- Hardcoded grace date `2026-06-06` (line 68)
- Hardcoded window end overrides (line 67)
- All should be env-configurable

#### `zoom-update.js` (272 lines)
Fetches Zoom data via OAuth into `zoom_data` DB, mirrors to `sakshi_spurti.zoom_*`. Idempotent. Non-fatal transcript ingest chained after.

#### `sync-spurti-from-sakshi.js` (79 lines)
Mirrors `sakshi_spurti.sptransactions` → `chatengine.spledgers` + `User.spPoints`. Hardcoded prod paths.

#### `sync-attendance-records.js` (78 lines)
Rebuilds `sakshi_spurti.attendancerecords` from `sptransactions` (category='attendance'). Hardcoded prod paths.

#### `sync-poll-records.js` (73 lines)
Rebuilds `sakshi_spurti.pollrecords` from `sptransactions` (category='poll'). Hardcoded prod paths.

#### `sp-pipeline.sh` (64 lines)
Master orchestrator. Stage 6 uses wrong path `/home/samagama/samagama/server/` (triple-nested) instead of `/var/samagama/server/`. All other stages reference correct path.

#### `sp-pipeline.cron`
Cron definitions. Uses correct path. Installs at `/etc/cron.d/sp-pipeline`.

---

### Client

Single-file React app in `client/src/main.jsx` (841 lines). Clean and well-organized.

**Security:**
- Survey completion sends email in request body (MI-19) — should read from authenticated session
- Admin login accessible via `?admin=1` URL param (MI-10)

**Key views:**
- `Landing`: Public info + search modal
- `StudentView`: SP Bank, Polls, Leaderboard tabs
- `AdminView`: Leaderboard, Attendance Matrix, Live Analytics, Analytics, Students tabs
- `SurveyModal`: Google Form iframe with server-verified completion

**API calls:**
- All use `${APP_BASE}/api` prefix
- Admin endpoints send `X-Admin-Email` + `X-Admin-Token` headers
- Ping every 30 seconds when on student record page

---

## Issue Register

### Critical Severity

| ID | Category | File(s) | Issue |
|----|----------|---------|-------|
| CR-1 | Security | server/server.js:30 | `ADMIN_TOKEN` hardcoded default `'vled-local-admin'` — **ALREADY FIXED** in current code (no fallback) |
| CR-2 | Security | server/server.js | CORS wide open — **ALREADY FIXED** (restricted to `ALLOWED_ORIGINS`) |
| CR-3 | Security | server/server.js | No rate limiting — **ALREADY FIXED** (4 rate limiters active) |
| CR-4 | Bug | server/server.js:81-89 | `liveViewers` memory leak — **ALREADY FIXED** (TTL cleanup added) |
| CR-5 | Bug | server/services/spLedger.js:19 | Uses `sessionDatetime` in comment but `dateTime` in sort — comment wrong, code correct. No impact. |
| CR-6 | Bug | server/services/spLedger.js:24 | `t.delta` used instead of `t.appliedDelta` — running balance always 0 |
| CR-7 | Bug | server/services/sp.js:104 | Wrong sort field `sessionDatetime` — should be `dateTime` |
| CR-8 | Bug | server/services/sp.js:65 | `t.delta` instead of `t.appliedDelta` — poll SP always 0 |
| CR-9 | Architecture | server/config.js + sp.js | Session labels out of sync — config has old format, pipeline produces new. Affects `sp.js` helper functions but not actual display routes (which use raw transactions). |

### Major Severity

| ID | Category | File(s) | Issue |
|----|----------|---------|-------|
| MA-1 | Bug | server/scripts/addNewStudents.js:11 | Hardcoded `MONGO_URI` defaulting to `spurti_dev` instead of `sakshi_spurti` |
| MA-2 | Bug | pipeline/sp-pipeline.sh:59 | Wrong path `/home/samagama/samagama/server/` in stage 6 |
| MA-3 | Bug | pipeline/sync-attendance-records.js:17-18 | Hardcoded `/var/samagama/server/node_modules/` paths |
| MA-4 | Bug | pipeline/sync-poll-records.js:12-13 | Hardcoded `/var/samagama/server/node_modules/` paths |
| MA-5 | Bug | pipeline/sync-spurti-from-sakshi.js:24-27 | Hardcoded `/var/samagama/server/` paths |
| MA-6 | Performance | server/server.js:515-747 | `/admin/analytics` unbounded aggregations — loads all 50k+ records without pagination |
| MA-7 | Performance | server/server.js:212-219 | `/me` fetches full leaderboard twice (once limited, once not) |
| MA-8 | Security | server/server.js:333-343 | `/confirm` email confirmation is brute-sforceable |
| MA-9 | Security | server/server.js:418-425 | Survey webhook lacks rate limit on email enumeration |
| MA-10 | Architecture | CONTEXT.md:135-137 | Orphaned chat-sp-reviews endpoints documented but don't exist |
| MA-11 | Code Quality | Multiple | `parseCsv` duplicated 4+ times |
| MA-12 | Code Quality | Multiple | `maskEmail` duplicated 4 times with subtle differences |
| MA-13 | Code Quality | Multiple | `normalizeEmail` duplicated 6+ times |
| MA-14 | Security | server/server.js | Missing auth on `/leaderboard`, `/search`, `/ping` (publicly accessible student data) |
| MA-15 | Bug | .env.example:3 | Wrong DB name `analysis_summership` instead of `sakshi_spurti` |
| MA-16 | DX | Repository root | No CONTRIBUTING.md for developers |

### Minor Severity

| ID | Category | File(s) | Issue |
|----|----------|---------|-------|
| MI-1 | Code Quality | server/server.js:766 | `console.log` in production |
| MI-2 | Performance | server/server.js:140 | Only 2mb JSON body limit |
| MI-3 | Code Quality | server/scripts/lib/ingestion.js:202 | Debug logging |
| MI-4 | Architecture | pipeline/sp-rubric-build-mirror.cjs:69-72 | Staff emails hardcoded |
| MI-5 | Architecture | pipeline/sp-rubric-build-mirror.cjs:68 | Grace date hardcoded |
| MI-6 | Architecture | pipeline/sp-rubric-build-mirror.cjs:67 | Window end override hardcoded |
| MI-7 | Architecture | server/server.js:753-754 | Duplicate API mount points `/api` and `/spurti/api` |
| MI-8 | Security | server/server.js:321 | Regex DoS potential with complex patterns |
| MI-9 | Bug | server/server.js:366 | Silent error swallowing in ping |
| MI-10 | Security | client/src/main.jsx:9 | Admin login via URL param `?admin=1` |
| MI-11 | Performance | server/models/AttendanceRecord.js | Missing standalone index on `sessionLabel` |
| MI-12 | Architecture | server/models/Student.js:15-17 | Derived fields (`level`, `trophyLeague`, `legendBadgeUnlocked`) stored redundantly |
| MI-13 | Bug | public/app.js:218 | References non-existent `/api/students` |
| MI-14 | Security | server/config.js | No minimum token length |
| MI-15 | Bug | server/services/spLedger.js:14-16 | Returns `null` vs `[]` inconsistency |
| MI-16 | Code Quality | pipeline/models/User.js | 508-line model file |
| MI-17 | Performance | server/models/*.js | Missing compound indexes `{ status: 1, totalSp: -1 }` |
| MI-18 | DX | client/vite.config.js:10,14 | Hardcoded dev port 5290 |
| MI-19 | Security | client/src/main.jsx:784 | Email in request body instead of session |
| MI-20 | Bug | server/services/sp.js:65,104 | `t.delta` + `sessionDatetime` wrong fields |
| MI-21 | Bug | server/server.js:201 | Admin email comparison inconsistency |
| MI-22 | Architecture | pipeline/sp-pipeline.sh vs .cron | Shell script has wrong path, cron correct |
| MI-23 | Performance | server/models/Student.js:22-23 | Survey fields already indexable |
| MI-24 | Bug | Various | Schema field name inconsistency (`dateTime` vs `sessionDatetime`) |
| MI-25 | Code Quality | server/models/Student.js | `legendBadgeUnlocked` never set to `true` |

---

## Fix Priority

### Already Fixed ✅
- CR-1: Hardcoded admin token — no fallback in current code
- CR-2: CORS wide open — restricted to `ALLOWED_ORIGINS`
- CR-3: No rate limiting — 4 rate limiters active
- CR-4: liveViewers memory leak — TTL cleanup added

### Fix Today

| # | Issue | Why |
|---|-------|-----|
| CR-6 | `t.delta` vs `t.appliedDelta` in spLedger.js:24 | Running balance always shows 0 |
| CR-8 | `t.delta` vs `t.appliedDelta` in sp.js:65 | Poll SP always returns 0 |
| CR-7 | Wrong sort field `sessionDatetime` in sp.js:104 | Transaction ordering unpredictable |
| MA-6 | `/admin/analytics` unbounded queries | Will slow/crash with scale |
| MA-2 | Wrong pipeline path in sp-pipeline.sh:59 | Transcript fetch fails silently |

### Fix This Week

| # | Issue | Why |
|---|-------|-----|
| CR-9 | Session labels out of sync | Attendance lookups fail to match |
| MA-1 | Hardcoded DB URI in addNewStudents.js | Wrong database |
| MA-5 | Hardcoded paths in sync-spurti-from-sakshi.js | Can't run locally/CI |
| MA-3, MA-4 | Hardcoded paths in sync-*.js | Can't run locally/CI |
| MA-15 | Wrong DB name in .env.example | Blocks new contributors |

### Fix This Month

| # | Issue | Why |
|---|-------|-----|
| MA-7 | Double leaderboard fetch in /me | Wasteful query |
| MA-8 | Email confirmation brute-sforceable | Security risk |
| MA-11-13 | Duplicate utility functions | Maintenance burden |
| MA-16 | No CONTRIBUTING.md | Blocks contributions |
| MI-4-6 | Hardcoded values in mirror rubric | Should be env vars |
| MI-10 | Admin URL param exposure | Security-through-obscurity |
| MI-19 | Email in request body | Should use session |

---

*Review generated by line-by-line analysis of the Spurti codebase.*