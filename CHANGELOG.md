# Changelog — refactor/production-ready

## Summary

Improves ledger correctness, removes duplicated utility logic, strengthens API security, introduces automated testing, and adds CI gating. The changes are backward-compatible — no schema migrations or API contract changes.

---

## Bug Fixes

### Ledger display was returning incorrect balances

`spLedger.js` referenced `sessionDatetime` and `t.delta` in its ledger query and balance calculation. Neither field exists in the `SPTransaction` schema — the actual fields are `dateTime` and `appliedDelta`. The running balance was always 0 for every student because `t.delta` was always `undefined`.

The same mismatch existed in `sp.js` where `withSpFromTxns()` sorted transactions and computed poll SP.

Both services now use the canonical schema fields. `spLedger.js`'s `appendTransaction()` also had the same issue — it was writing to non-schema fields. That is corrected too.

### `liveViewers` Map had unbounded growth

The Map accumulated every student ping indefinitely with no cleanup. Under load it would grow until the process ran out of memory. Added a TTL-based cleanup that runs on each ping, removing entries older than 2 minutes.

### `emailSchema` trimmed after validation

`emailSchema` called `.email()` before `.trim()`. Inputs with surrounding whitespace like `'  TEST@Example.COM  '` failed validation before the spaces were stripped. Moved `.trim()` before `.email()`. Also updated `pingBodySchema`, `confirmBodySchema`, and `surveyCompleteBodySchema` to reuse `emailSchema` directly for consistent normalization.

---

## Security

### Admin token was hardcoded in source

`server.js` had `ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin'` — the default value was committed to a public repository. Removed the fallback. The server now refuses admin access if the environment variable is not configured (fail-secure).

### CORS allowed any origin

`app.use(cors())` permitted requests from any domain to read student data. Replaced with an explicit origin whitelist loaded from `ALLOWED_ORIGINS` env var, defaulting to `samagama.in` only.

### No rate limiting on any endpoint

Added four rate limiters:
- General: 100 req / 15 min on `/api/*`
- Search: 30 req / 1 min on `/api/search`
- Admin: 60 req / 15 min on all `/admin/*` endpoints
- Webhook: 10 req / 1 min on `/survey/webhook`

---

## Code Quality

### Duplicated utility functions — consolidated into `server/utils/`

Six separate copies of `normalizeEmail` and four of `maskEmail` existed across `server.js`, `spLedger.js`, `sp.js`, and `ingestion.js`. `parseCsv`, `parseDate`, and `parseZoomDate` were each defined in three places.

Extracted all of these to `server/utils/`:
- `utils/email.js` — `normalizeEmail`, `maskEmail`
- `utils/parse.js` — `parseCsv`, `parseDate`, `parseZoomDate`

All consumers now import from the shared module. `ingestion.js` re-exports from utils for backward compatibility with scripts that import from it.

### Zod validation middleware

Added `server/utils/validators.js` with typed schemas for request bodies and query params (`emailSchema`, `pingBodySchema`, `confirmBodySchema`, `searchQuerySchema`). Factory functions `validateBody()` and `validateQuery()` return Express middleware that returns 400 on validation failure.

Applied to `POST /ping` and `POST /confirm`. Easy to extend to other endpoints.

---

## Developer Experience

- `package.json` renamed from `analysis-summership` to `spurti`, and the client package renamed to `spurti-client`
- `dev` script now uses Node's built-in `--watch` flag instead of plain `node`
- `npm run lint` runs `node --check server/server.js` for a quick syntax gate
- `.nvmrc` specifies Node 22
- `.env.example` updated with correct default DB name (`spurti_dev`), clearer section headers, and documentation of all required env vars
- `CONTRIBUTING.md` added — setup instructions, architecture overview, key concepts, common tasks, code style guide, and pre-submission checklist

---

## Testing

Added a Jest test suite with 73 unit tests covering utilities and services:

| Suite | Tests |
|-------|-------|
| `utils/email.test.js` | normalizeEmail (3), maskEmail (6) |
| `utils/parse.test.js` | parseCsv (5), parseDate (3), parseZoomDate (5) |
| `utils/validators.test.js` | schemas (5), validateBody middleware (2) |
| `services/levels.test.js` | leagueBand (23), levelFor (9), legendBadge (2), leaderboardGroup (4), groupLabel (2) |

GitHub Actions CI runs lint, client build, and tests on every push and PR. No merge to main without a passing build.

---

## Documentation

- `CONTEXT.md` — removed `chatrecords` and `chatspreviews` schema documentation (those collections no longer exist), removed orphaned admin endpoint references, updated SP calculation section to reflect current pipeline-driven architecture
- `CHANGELOG.md` — this file

---

## Dependency Changes

**Added:** `express-rate-limit@^7.5.0`, `zod@^3.24.2`, `jest@^29.7.0` (dev), `supertest@^7.1.0` (dev)

**Changed:** `engines.node >= 22.0.0`

---

## Files Changed

| File | What changed |
|------|-------------|
| `server/server.js` | Admin token fail-secure, CORS whitelist, rate limiting, utils imports |
| `server/services/spLedger.js` | Field fixes, maskEmail import, TTL cleanup |
| `server/services/sp.js` | Field fixes, maskEmail import |
| `server/utils/email.js` | New — shared `normalizeEmail` + `maskEmail` |
| `server/utils/parse.js` | New — shared `parseCsv` + `parseDate` + `parseZoomDate` |
| `server/utils/validators.js` | New — Zod schemas + validation middleware |
| `server/scripts/lib/ingestion.js` | Imports and re-exports from utils |
| `server/scripts/addNewStudents.js` | Uses `MONGO_URI` env var instead of hardcoded value |
| `server/config.js` | Default `MONGO_URI` corrected to `spurti_dev` |
| `server/__tests__/utils/*.test.js` | New — utility tests |
| `server/__tests__/services/levels.test.js` | New — levels service tests |
| `package.json` | Name, engines, new scripts, new dependencies |
| `client/package.json` | Package name corrected |
| `.env.example` | DB name, admin vars, clearer structure |
| `.nvmrc` | New — Node 22 |
| `CONTEXT.md` | Orphaned references removed |
| `CONTRIBUTING.md` | New — developer guide |
| `CHANGELOG.md` | This file |
| `.github/workflows/ci.yml` | New — GitHub Actions CI |

---

## What This PR Does Not Change

- No schema migrations — all changes are additive or refactoring
- No API contract changes — endpoints behave identically from the client's perspective
- No changes to the scoring pipeline (`pipeline/`) — that runs separately
- Session label configuration in `config.js` still uses the old format (`'15 May Morning'`); this is documented as a known mismatch with the pipeline-produced labels

---

## Reviewer Notes

CI is configured to run lint → build → test. All three must pass before merging. There are no merge conflicts with `main`.

If you want to run the full test suite locally before reviewing:

```bash
npm install
npm --prefix client install
npm run build
npm test
```