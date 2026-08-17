## What this PR does

Rebuilds **PR #42 — Smart Nudge System** (r4dh1ka/spurti, `feat/nudge-system`) on top of **current `main`** (`2f4f9b5`), keeping the original's whole idea and structure while fixing everything flagged in review.

The original PR is stale: based on a July-5 commit, it conflicts with current `main` and can't be updated in place (its head is `r4dh1ka/spurti`, not the owner's fork) — so this is a clean reimplementation. **It supersedes #42.**

### Feature (unchanged from the original idea)
Automatically detects at-risk students and nudges them before disengagement compounds:
- **Detection:** flags students who in the last 7 days **missed ≥ 2 mandatory sessions** or **attempted zero polls**, and writes a personalized message ("Hey Abhishek, you've missed 3 sessions this week…").
- **Delivery:** in-app amber `NudgeBanner` on the dashboard (dismissable) **+ email** via nodemailer/SMTP. Reaches students even when they aren't logging in — the only feature in the repo that does.
- **Admin control:** `POST /api/admin/nudges/run` triggers detection + email, returning a summary (`generated` / `sent` / `skipped` / `errors`); `GET /api/admin/nudges?status=` lists the log. Both behind the existing `adminGuard`.

## What was fixed vs. the original PR

### 1. Auth (security)
- **Before:** student routes trusted the spoofable `X-Student-Email` header / `studentEmail` request body.
- **After:** `GET /api/students/:id/nudges` and `POST /api/nudges/:id/dismiss` authenticate via the **same-origin session cookie** (`studentEmailFromRequest` → Samagama `chatengine_token` passthrough, the app's standard trust model) and verify the caller owns the account (primary **or** alternate email). No email is trusted from the client. Search/confirm flow (no cookie) simply sees no nudges.

### 2. Missed-session detection (correctness)
- **Before:** counted attendance *records created* in the last 7 days that weren't `qualified` — so a student who never showed up at all (no record → not counted) was never flagged.
- **After:** derives the window from `sessions` (`date >= now-7d`), then counts how many of those mandatory sessions the student has **no qualified attendance record** for. True absentees are now detected.
- **Bonus (from #13):** the nudge message now names the **specific missed sessions** (labels, first 3 + "+N more"), borrowing the data-grounded "list the sessions you missed" pattern from PR #13's `templatedNarrative` — no AI involved, just the concrete session labels. Example: *"Hey X, you've missed 3 sessions this week (Day 45 (Mon Aug 03), Day 46 (Tue Aug 04), Day 47 (Wed Aug 05))…"*.

### 3. Reasons trimmed to the current rubric
- **Before:** `reason` enum included `sp_drop` and `rank_drop`.
- **After:** only `missed_sessions` and `no_polls`. SP is **positive-only** in the current band/tier rubric (except manual penalties), so an SP-drop rule effectively never fires; `rank_drop` was unused. Dropping both removes dead detection paths.

### 4. Email without SMTP config (operability)
- **Before:** `sendEmailNudge` always attempted a transport — spammed error logs when SMTP wasn't configured.
- **After:** skips cleanly when `SMTP_HOST` is unset (reported as `skipped` in the admin summary); the in-app banner still works. `.env.example` documents the optional SMTP block.

### 5. Admin log bounded
- `GET /api/admin/nudges` capped at 500 rows (was unbounded).

## Relationship to PR #13 ("Your Week, Told" AI recap)

#13 is from the same fork (`r4dh1ka/spurti`) and the same engagement genre (per-student
personalized messages from their own data), so it was reviewed alongside #42. Its valuable
core — a deterministic, data-grounded narrative listing the specific sessions a student
missed — is **incorporated here** (see §2, Bonus). What was **not** carried over:

- the **AI generation path** (`openai` dep + Samagama gateway + `max_tokens: 4000` unbounded cost model);
- the `?email=` ownership gate (PII in URLs; this PR uses cookie-auth only);
- the **recap dashboard card** — a passive in-app summary that duplicates the pulse cards / SP Bank, the same redundancy as #9/#12 (both dropped as superseded).

So #13's useful idea survives in the nudge engine, without its cost and PII problems.

## Files changed
- `server/models/Nudge.js` — model (reason enum trimmed).
- `server/nudgeEngine.js` — detection + email (rewritten detection logic).
- `server/server.js` — 4 routes (2 admin, 2 student), cookie-auth.
- `client/src/components/NudgeBanner.jsx` — class-based banner, no email header.
- `client/src/main.jsx` — render banner under the dashboard topbar.
- `client/src/styles.css` — `.nudge-*` styles (no existing styles touched).
- `package.json` / `package-lock.json` — `nodemailer` added.
- `.env.example` — SMTP block (optional).

## Verification
- `npm run build` — pass
- `node --check server/server.js server/nudgeEngine.js server/models/Nudge.js` — pass

## Reviewer checklist
1. Confirm cookie-auth on the two student routes (no `X-Student-Email` anywhere).
2. Run `POST /api/admin/nudges/run` and check the summary shape; confirm absent students are flagged and de-dup per-day works (`Nudge.findOne({ studentId, status:'pending', createdAt: {$gte: todayStart} })`).
3. With SMTP unset, confirm emails are skipped (not errored) and the banner still renders for flagged students.
