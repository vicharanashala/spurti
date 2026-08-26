# HANDOFF → Samagama admin: fix the "SP button" not updating

**For:** the `samagama` / `samagama1` user (you have sudo + the prod `.env` with admin Mongo creds).
**From:** the Sakshi side (scoring is healthy; the problem is the mirror back into your DB).
**Goal:** (1) make the SP shown on the samagama.in button correct **right now**, and (2) make sure it **keeps** showing the latest SP automatically, forever.

You can run this whole file top to bottom. Every step is safe (dry-run first, backups noted). Where a decision exists, the answer is already **yes** — just run the command.

---

## 0. 30-second background (why this happens)

There are **two** SP numbers, from **two** databases:

| Shown where | Read from | Owner | State |
|---|---|---|---|
| `/spurti` dashboard (after the click) | `sakshi_spurti.students.totalSp` | Sakshi | ✅ correct & current |
| **The button on samagama.in** | `chatengine.users.spPoints` | **You (Samagama)** | ❌ stale |

Scoring now lives on the **Sakshi side**: a rubric writes `sakshi_spurti.sptransactions` every 6h (verified current — 52k+ txns, scored through today). The button shows `chatengine.users.spPoints`, which is a **mirror** produced by your script **`/var/samagama/server/sync-spurti-from-sakshi.js`** (it copies `sakshi_spurti.sptransactions` → `chatengine.spledgers` and recomputes each `users.spPoints`).

**That mirror has stopped running successfully.** Everything below fixes the mirror and makes it reliable. (The Sakshi side needs no changes.)

---

## 1. Fix it RIGHT NOW (manual mirror run)

Run as the same user the cron uses. Try `samagama` first; if that account doesn't exist use `samagama1`.

```bash
# 1a. Preview — reads Sakshi's ledger, writes NOTHING. Confirms it can connect + read.
sudo -u samagama bash -lc 'cd /var/samagama/server && DRY_RUN=1 node sync-spurti-from-sakshi.js'
```

**Expected good output** is something like:
```
her sptransactions: 52030 | mapped rows: 52030 | bad/skipped: 0 | distinct emails: 3074
our spledgers now: NNNNN (will be REPLACED by the 52030 mapped rows)
spPoints (sum of her deltas) sample:
  someone@example.com               current=645 -> 790
DRY_RUN — would wipe ... insert 52030, recompute spPoints for 3074 emails.
```
- If you see `distinct emails: ~3000` and a sample where `current=` differs from the `-> ` target, the script works and the data is just stale → continue to 1b.
- If it **errors or aborts** here, skip to **§2** (it prints the exact reason — DB auth, `ABORT: source returned N rows`, a stack trace, etc.).

```bash
# 1b. Apply for real — wipe+reload chatengine.spledgers and recompute every users.spPoints.
sudo -u samagama bash -lc 'cd /var/samagama/server && node sync-spurti-from-sakshi.js'
```

**The button is now correct.** Verify with §4. Then do §3 so it stays correct.

> Safety: the script self-aborts without touching anything if Sakshi's ledger returns < 5000 rows (guards against an empty read). It is idempotent — safe to re-run anytime.

---

## 2. Find why it stopped (only if §1a errored, or to confirm the root cause)

```bash
# What the cron has been logging:
sudo -u samagama tail -60 /var/samagama/server/logs/updatespurti.log
sudo -u samagama tail -60 /var/samagama/server/logs/sp-pipeline.log
# When did the mirror cron last actually run? (mtime = last run)
sudo -u samagama stat -c '%n  last run: %y' /var/samagama/server/logs/updatespurti.log
```

Match what you see to the fix:

| Symptom in the log / output | Cause | Fix |
|---|---|---|
| Log mtime is **days old**, nothing recent | the every-2h cron isn't firing | §3.A (repair the cron file) |
| `ABORT: source returned N rows (< 5000)` | ran while Sakshi's rubric was mid-wipe | harmless; next run recovers. Bump frequency in §3.C |
| `MongoServerError` / `Unauthorized` / auth | `.env` Mongo creds changed | fix `MONGO_URI` in `/var/samagama/server/.env`, re-run §1b |
| `Cannot find module` / `models/User` | a moved/renamed file | restore the path the script `require`s, re-run §1b |
| `sp-pipeline.log` shows **`ABORT: sp-rubric-build failed`** | the daily pipeline dies at the old rubric **before** its sync stage | §3.B (remove the obsolete rubric stage) |
| `JavaScript heap out of memory` in `sp-pipeline.log` | the 2GB zoom stage OOM'd, aborting the run | §3.B decouples the sync so this no longer blocks the button |

In almost all cases the **single most important durable fix is §3.A + §3.B below** — they make the button refresh on its own, decoupled from the fragile daily pipeline.

---

## 3. Make it reliable FOREVER

### 3.A — Guarantee the standalone mirror cron exists and is valid

This is the canonical, self-contained job that keeps the button fresh, independent of everything else. Re-install it exactly (idempotent):

```bash
sudo tee /etc/cron.d/updatespurti >/dev/null <<'CRON'
# #updatespurti — mirror Sakshi's sakshi_spurti.sptransactions into our SP store
# (chatengine.spledgers + users.spPoints) so the samagama.in SP button + /spurti
# always show the latest score. Wipe-and-reload; idempotent; self-aborts on empty read.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Hourly at :20 — Sakshi re-scores every 6h (~:45), so :20 always catches the freshest data.
20 * * * * samagama cd /var/samagama/server && /usr/bin/node sync-spurti-from-sakshi.js >> /var/samagama/server/logs/updatespurti.log 2>&1
CRON
sudo chown root:root /etc/cron.d/updatespurti
sudo chmod 644 /etc/cron.d/updatespurti     # cron.d files MUST be 644, root-owned, and have NO dot in the name
sudo systemctl restart cron                  # pick up the change
```

> This changes the old **every-2-hours** schedule to **hourly** so the button is never more than ~1h behind. (The job is cheap and idempotent.) If the cron user on your box is `samagama1`, change `samagama` in the line above to `samagama1`.

Confirm cron will run it:
```bash
systemctl is-active cron        # -> active
grep -H . /etc/cron.d/updatespurti
```

### 3.B — Stop the daily pipeline from running the OLD rubric (it now fights Sakshi's and can block the sync)

Scoring moved to the Sakshi side. Your `/var/samagama/server/sp-pipeline.sh` still runs its own old `sp-rubric-build.js` (Stage 2), which (a) overwrites `sakshi_spurti.sptransactions` with stale logic and (b) **fail-fasts the whole script before reaching its own sync stage** when it errors. Remove that stage.

```bash
# Back up first
sudo -u samagama cp -a /var/samagama/server/sp-pipeline.sh /var/samagama/server/sp-pipeline.sh.bak.$(date -u +%Y%m%dT%H%M%SZ)
```

Then edit `/var/samagama/server/sp-pipeline.sh` and **delete the entire Stage 2 block** — these lines:

```bash
echo "=== $(ts) STAGE 2/3: sp-rubric-build APPLY=1 ==="
APPLY=1 OUT_DIR=/var/samagama/server/sp-runs $NODE $HEAP sp-rubric-build.js
rc=$?; echo "--- $(ts) stage2 exit=$rc ---"
[ $rc -eq 0 ] || { echo "ABORT: sp-rubric-build failed (rc=$rc)"; exit 1; }
```

Leave Stage 1 (zoom ingest → it feeds Sakshi's mirror), Stage 3 (`sync-spurti-from-sakshi`), and Stages 4–6 as they are. Result: the daily pipeline ingests Zoom and mirrors SP, but no longer runs a competing rubric and no longer aborts before the sync.

> Do **NOT** touch Stage 1 (`zoom-update.js`) — Sakshi's rubric depends on the `zoom_*` data it mirrors. Only Stage 2 (the rubric) is being removed.

### 3.C — (already covered) freshness

With 3.A hourly + 3.B trimmed, the button tracks Sakshi's score within ~1 hour, and a transient failure of any one run self-heals on the next hour. Nothing else is required.

---

## 4. Verify the button is now correct

Pick any active student's email and compare the two sides. Run as samagama (uses your prod `.env` admin creds):

```bash
sudo -u samagama node -e '
require("/var/samagama/server/node_modules/dotenv").config({path:"/var/samagama/server/.env"});
const {MongoClient}=require("/var/samagama/server/node_modules/mongodb");
(async()=>{
  const base=(process.env.MONGO_URI||"").replace(/\/[^/?]*(\?.*)?$/,"");
  const c=await MongoClient.connect(process.env.MONGO_URI);              // chatengine (your DB)
  const s=await MongoClient.connect(base+"/sakshi_spurti?authSource=admin");
  // top scorer on the authoritative side
  const top=await s.db().collection("students").find({}).sort({totalSp:-1}).limit(1).next();
  const email=top.email;
  const sak=top.totalSp;
  const u=await c.db().collection("users").findOne({email},{projection:{spPoints:1,spPointsUpdated:1}});
  console.log("email            :",email);
  console.log("Sakshi totalSp   :",sak,"(authoritative — what /spurti shows)");
  console.log("Button spPoints  :",u?u.spPoints:"(no user)","(what samagama.in shows)");
  console.log("spPointsUpdated  :",u&&u.spPointsUpdated);
  console.log(sak===(u&&u.spPoints)?"MATCH ✅ button is in sync":"MISMATCH ❌ re-run §1b");
  await c.close(); await s.close();
})().catch(e=>{console.error(e.message);process.exit(1)});'
```

- `MATCH ✅` → done. The hourly cron (3.A) keeps it that way.
- `MISMATCH ❌` → re-run §1b; if it persists, the totals genuinely differ — paste the §2 log output back to the Sakshi side.

---

## 5. Summary of what you changed

1. Ran `sync-spurti-from-sakshi.js` once by hand → button correct immediately.
2. Re-installed `/etc/cron.d/updatespurti` as an **hourly** standalone mirror → button auto-refreshes ≤1h, resilient to single-run failures.
3. Removed the obsolete **Stage 2 rubric** from `sp-pipeline.sh` → daily pipeline no longer competes with Sakshi's scoring or aborts before its sync stage.

No Sakshi-side change is needed — `sakshi_spurti` is the single source of truth and is already current. If anything looks off on the **values** themselves (not the freshness), that's a Sakshi-side rubric question; everything here is purely the mirror into your `chatengine` DB.

---
*Generated 2026-06-29. Script referenced: `/var/samagama/server/sync-spurti-from-sakshi.js` (unchanged — only scheduling/pipeline around it is fixed).*
