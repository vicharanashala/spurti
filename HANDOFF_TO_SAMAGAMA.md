# Spurti — Handoff to the `samagama` owner

**From:** Sakshi (Spurti web app + `sakshi_spurti` DB)
**Date:** 2026-06-27

**TL;DR:** The Spurti SP pipeline (which runs as the `samagama` user) **stopped
producing data after 23 June**. The student dashboard is up and serving fine,
but the SP numbers are stale (frozen at 23 Jun). The missing days **cannot be
scored by anyone until the Zoom fetch runs again**, and that only runs under
`samagama` — Sakshi has no access to do it. Steps to fix are in Section 4.

---

## 1. What is working

- **Web app / student dashboard:** `https://samagama.in/spurti/` → HTTP 200.
- **APIs:** `/spurti/api/leaderboard`, `/spurti/api/config` → 200 with live data.
- **Button / login handoff:** verified end-to-end with a real student — signed
  token → `/spurti/auth?token=…` → cookie set → `/api/me` returns the student's
  SP, rank, and transactions. **Students can see their dashboard.**

This is **not an outage.** The only problem is data freshness.

## 2. Why the data is not ingested

The SP data pipeline (your cron jobs in `/var/samagama/server`, running as
`samagama`) **stopped after 23 June 2026**:

| Signal | Value |
|--------|-------|
| Latest `zoom_data` meeting (and the `sakshi_spurti.zoom_*` mirror) | **2026-06-23** |
| Latest `sptransactions` (scored SP) | **2026-06-23** |
| Latest `sp-runs/` APPLY backup | **2026-06-16** |
| Days missing | **24, 25, 26, (27) June** |

Cron itself is alive (the nightly `sp-runs` prune ran on 26 Jun 21:45), so **a
script is failing, not the scheduler** — almost certainly `zoom-update.js`
failing on Zoom auth (expired/revoked S2S token). That starves everything
downstream: no new `zoom_data` → nothing for `sp-rubric-build.js` to score →
SP frozen at 23 Jun. **The missing days don't exist in any database yet**, so
they can't be scored until the Zoom fetch succeeds again.

## 3. What access Sakshi has (and why Sakshi can't fix this)

| Resource | Sakshi access |
|----------|---------------|
| `sakshi_spurti` database | **read/write** (this is all Sakshi owns) |
| `zoom_data` database | **none** — "not authorized" |
| `chatengine` database (roster, start dates) | **none** — "not authorized" |
| `/var/samagama/server/.env` (Zoom + admin creds) | **none** — `600`, samagama-only |
| `/var/samagama/server/logs/` | **none** — `drwx-w---- samagama` |
| Zoom S2S credentials | **none** |
| `sudo` to `samagama` | **none** (no passwordless sudo) |

Everything Spurti needs (the `zoom_*` data and the `candidates` roster) only
reaches Sakshi because **your scripts push it into `sakshi_spurti`**. Sakshi
cannot pull from the source databases, cannot read the Zoom credentials, cannot
read the pipeline logs, and cannot run the pipeline. So when the samagama-side
pipeline breaks, **Sakshi can only serve whatever was last pushed (23 Jun) and
cannot intervene.** Fixing ingestion must be done as `samagama`.

## 4. How to fix it (please run as `samagama`)

### Step 1 — Confirm the cause (read the logs)
```bash
tail -60 /var/samagama/server/logs/sakshi-zoom.log
tail -60 /var/samagama/server/logs/sp-pipeline.log
```
Look for a Zoom error (401 / invalid_client / expired token) in `zoom-update.js`.
**If the Zoom token is dead, renew the Zoom Server-to-Server OAuth app first**
(`ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` in
`/var/samagama/server/.env`).

### Step 2 — Fetch the missing Zoom days
```bash
cd /var/samagama/server
node --max-old-space-size=2048 zoom-update.js --from 2026-06-24 --to 2026-06-27
```

### Step 3 — Score (dry preview first, then apply)
```bash
node sp-rubric-build.js                       # DRY: prints counts, writes nothing
APPLY=1 OUT_DIR=/var/samagama/server/sp-runs \
  node --max-old-space-size=2048 sp-rubric-build.js
```

### Step 4 — Refresh the records the dashboard reads
```bash
node sync-attendance-records.js
node sync-poll-records.js
# (sync-spurti-from-sakshi.js too, if the samagama platform still displays SP)
```

After Step 4, tell me and I'll **verify from Sakshi's side** (read-only): new
`Day 34–37` sessions present, transaction count up, a sample student's
`sum(appliedDelta) == totalSp`, and `/api/me` reflecting the new days. Your
normal cron should then resume on its own once the Zoom token is valid — these
manual steps just backfill the gap immediately.

---

### What I need back from you
- Output of **Step 1** (the two `tail` commands) — so we confirm it's the Zoom token.
