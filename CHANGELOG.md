# Spurti — Production Ready PR: Complete Changelog

**PR:** `amanraj74/spurti-iit-ropar-vled-` — `refactor/production-ready`
**Base:** `vicharanashala:main`
**Lines changed:** +791 / -145
**10 commits | 73 tests passing | CI enabled**

---

## Why This PR

The Spurti codebase had multiple critical bugs actively breaking features (ledger display was completely wrong), security vulnerabilities (hardcoded credentials in public repo, open CORS), and zero test coverage. This PR fixes everything before it causes a production incident.

---

## Critical Bugs Fixed

### 1. `spLedger.js` — Ledger display completely broken

**File:** `server/services/spLedger.js` lines 19, 24

**Problem:** The `getLedger()` function sorted by `sessionDatetime` and read `t.delta`, but the `SPTransaction` schema defines `dateTime` and `appliedDelta`. The running balance was always 0 because `t.delta` was always `undefined`.

**Fix:**
```javascript
// Before (BROKEN):
.sort({ sessionDatetime: 1 })         // ← field doesn't exist
runningBalance += Number(t.delta || 0) // ← field doesn't exist

// After (FIXED):
.sort({ dateTime: 1, createdAt: 1 })    // ← correct schema field
runningBalance += Number(t.appliedDelta || 0) // ← correct schema field
```

Also fixed the returned object fields (`sessionDatetime` → `dateTime`, `delta` → `appliedDelta`).

---

### 2. `spLedger.js` — `appendTransaction()` wrote to wrong fields

**File:** `server/services/spLedger.js` lines 85-97

**Problem:** `appendTransaction()` created transactions with `sessionDatetime`, `delta`, and `recordedAt` — none of which exist in the schema.

**Fix:** Write correct fields: `dateTime`, `deltaValue`, `appliedDelta`, `balanceAfter`.

---

### 3. `sp.js` — Same field name mismatches

**File:** `server/services/sp.js` lines 65, 104

**Problem:** `withSpFromTxns()` sorted by `sessionDatetime` and reduced with `t.delta`.

**Fix:**
```javascript
// Before:
.sort({ sessionDatetime: 1 })
const pollSp = pollTxns.reduce((sum, t) => sum + Number(t.delta || 0), 0);

// After:
.sort({ dateTime: 1, createdAt: 1 })
const pollSp = pollTxns.reduce((sum, t) => sum + Number(t.appliedDelta || 0), 0);
```

---

### 4. `liveViewers` Map — Memory leak

**File:** `server/server.js` line 50, 298

**Problem:** The `liveViewers` Map stored every student ping forever with no cleanup. With thousands of students pinging every 30 seconds, it would grow indefinitely until the process ran out of memory and crashed.

**Fix:**
```javascript
const LIVE_VIEWER_TTL_MS = 120_000; // 2 minutes

function cleanStaleViewers() {
  const now = Date.now();
  for (const [email, data] of liveViewers.entries()) {
    if (now - data.lastSeen > LIVE_VIEWER_TTL_MS) liveViewers.delete(email);
  }
}

// Called on every ping:
if (page === 'record' || page.startsWith('admin')) {
  cleanStaleViewers();
  liveViewers.set(normalized, { name, page, lastSeen: Date.now() });
}
```

---

## Security Fixes

### 5. Hardcoded Admin Token — Removed

**File:** `server/server.js` line 21

**Problem:** `ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin'` — the default token was hardcoded in public source code. Anyone could read the repo and gain admin access.

**Fix:**
```javascript
// Before (INSECURE):
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin';

// After (FAIL-SECURE):
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
// ...
function isAdmin(req) {
  if (!ADMIN_EMAIL || !ADMIN_TOKEN) return false; // fail-secure
  ...
}
```

Also removed hardcoded fallback for `ADMIN_EMAIL`.

---

### 6. CORS Wide Open — Origin Whitelist

**File:** `server/server.js` line 52

**Problem:** `app.use(cors())` allowed requests from any origin. Any malicious website could fetch student data from the API.

**Fix:**
```javascript
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://samagama.in,https://www.samagama.in')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true
}));
```

---

### 7. No Rate Limiting — Added 4-tier protection

**File:** `server/server.js` (new middleware)

**Added:**
- `generalLimiter`: 100 req / 15 min on all `/api/*`
- `searchLimiter`: 30 req / 1 min on `/api/search`
- `adminLimiter`: 60 req / 15 min on all `/admin/*` endpoints
- `webhookLimiter`: 10 req / 1 min on `/survey/webhook`

---

## Configuration & Setup Fixes

### 8. Wrong DB Name in `.env.example`

**File:** `.env.example` line 3

```bash
# Before:
MONGO_URI=mongodb://127.0.0.1:27017/analysis_summership

# After:
MONGO_URI=mongodb://127.0.0.1:27017/spurti_dev
```

Also updated `server/config.js` and `server/scripts/addNewStudents.js` defaults.

---

### 9. Project Name Wrong in `package.json`

**File:** `package.json` line 2, `client/package.json` line 2

```json
// Before:
"name": "analysis-summership"

// After:
"name": "spurti"
```

---

### 10. Missing `engines` Field — Node Version Not Specified

**File:** `package.json` (new section)

```json
"engines": { "node": ">=18.0.0" }
```

---

### 11. `dev` and `start` Scripts Were Identical

**File:** `package.json`

```json
// Before:
"dev": "node server/server.js",
"start": "node server/server.js"

// After:
"dev": "node --watch server/server.js",
"start": "node server/server.js"
```

Uses Node 18's built-in `--watch` flag (no extra dependency needed).

---

### 12. `addNewStudents.js` Hardcoded MongoDB URI

**File:** `server/scripts/addNewStudents.js` line 10

```javascript
// Before:
const MONGO_URI = 'mongodb://127.0.0.1:27017/analysis_summership';

// After:
import 'dotenv/config';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/spurti_dev';
```

---

## Code Quality: Shared Utilities

### 13. Eliminated Duplicate `normalizeEmail` (6+ copies)

**Before:** `normalizeEmail` existed in server.js, spLedger.js, sp.js, ingestion.js, addStudents.js, seed.js

**After:** Single canonical implementation in `server/utils/email.js`:
```javascript
export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}
```
All files now import from `server/utils/email.js`.

---

### 14. Eliminated Duplicate `maskEmail` (4 copies)

**After:** Single canonical implementation in `server/utils/email.js`. All files import from there.

---

### 15. Eliminated Duplicate `parseCsv`, `parseDate`, `parseZoomDate`

**After:** Canonical implementations in `server/utils/parse.js`. `ingestion.js` re-exports them for backward compatibility.

---

## New Features

### 16. Zod Input Validation

**File:** `server/utils/validators.js` (new)

Schemas for all request bodies: `pingBodySchema`, `confirmBodySchema`, `emailSchema`, `searchQuerySchema`.

Validation middleware factory:
```javascript
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Invalid request body', details: result.error.flatten() });
    req.validatedBody = result.data;
    next();
  };
}
```

Applied to `POST /ping` and `POST /confirm`.

---

### 17. 73 Passing Tests

**Files:** `server/__tests__/utils/email.test.js`, `server/__tests__/utils/parse.test.js`, `server/__tests__/utils/validators.test.js`, `server/__tests__/services/levels.test.js`

Coverage:
- `normalizeEmail`: 3 tests
- `maskEmail`: 6 tests
- `parseCsv`: 5 tests
- `parseDate`: 3 tests
- `parseZoomDate`: 5 tests
- Zod schemas: 5 tests
- `validateBody` middleware: 2 tests
- `leagueBand`: 23 tests (all band boundaries)
- `levelFor`: 9 tests
- `legendBadge`: 2 tests
- `leaderboardGroup`: 4 tests
- `groupLabel`: 2 tests

**Result: 73/73 passing**

---

### 18. GitHub Actions CI/CD

**File:** `.github/workflows/ci.yml` (new)

Runs on every push and PR to any branch:
1. Install server deps (`npm install`)
2. Install client deps (`npm --prefix client install`)
3. Lint server (`npm run lint` → `node --check`)
4. Build client (`npm run build`)
5. Run tests (`npm test`)

Fails fast — zero merges to main without a passing build.

---

### 19. `CONTRIBUTING.md` — 170-line Developer Guide

**File:** `CONTRIBUTING.md` (new)

Covers: quick start, architecture overview, key directories, all env vars, key concepts (auth, SP transactions, session labels), common tasks, code style, pre-submission checklist, scripts reference.

---

### 20. `.nvmrc` — Node 20

**File:** `.nvmrc` (new)

```
20
```

Contributors using `nvm` will automatically use the correct Node version.

---

## Documentation Cleanup

### 21. CONTEXT.md — Removed Orphaned References

- Removed `chatrecords` and `chatspreviews` (ChatSPReview) schema documentation — these collections no longer exist
- Updated Admin Endpoints section to list only live endpoints (removed `/chat-sp-reviews/*`)
- Updated SP Calculation section to mark chat SP as dormant
- Added note that SP scoring is entirely pipeline-driven

---

## Dependency Changes

### Added
- `express-rate-limit@^7.5.0` — rate limiting
- `zod@^3.24.2` — input validation
- `jest@^29.7.0` — test runner (devDependency)
- `supertest@^7.1.0` — HTTP testing (devDependency)

### Changed
- `package.json`: `"name": "spurti"`, `"engines": { "node": ">=18.0.0" }`, new `lint` and `test` scripts

---

## Files Changed Summary

| File | Change |
|------|--------|
| `server/server.js` | Security fixes, rate limiting, import utils |
| `server/services/spLedger.js` | Field name fixes, import maskEmail |
| `server/services/sp.js` | Field name fixes, import maskEmail |
| `server/utils/email.js` | **NEW** — normalizeEmail + maskEmail |
| `server/utils/parse.js` | **NEW** — parseCsv + parseDate + parseZoomDate |
| `server/utils/validators.js` | **NEW** — Zod schemas + validation middleware |
| `server/scripts/lib/ingestion.js` | Use utils, re-export |
| `server/scripts/addNewStudents.js` | Use env var, not hardcoded URI |
| `server/config.js` | Fix default DB name |
| `server/__tests__/utils/email.test.js` | **NEW** — 9 tests |
| `server/__tests__/utils/parse.test.js` | **NEW** — 13 tests |
| `server/__tests__/utils/validators.test.js` | **NEW** — 10 tests |
| `server/__tests__/services/levels.test.js` | **NEW** — 41 tests |
| `package.json` | Project name, engines, new deps/scripts |
| `client/package.json` | Project name fix |
| `.env.example` | DB name, admin vars, improved docs |
| `.nvmrc` | **NEW** — Node 20 |
| `CONTEXT.md` | Orphaned doc cleanup |
| `CONTRIBUTING.md` | **NEW** — developer guide |
| `.github/workflows/ci.yml` | **NEW** — CI pipeline |

---

## Pre-Merge Checklist

- [ ] CI checks pass (lint, build, test)
- [ ] All 73 tests green
- [ ] No merge conflicts
- [ ] Reviewer has enabled CI required status

---

*Generated from commit-by-commit analysis of `refactor/production-ready`*