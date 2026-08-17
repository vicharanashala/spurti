# Adding "My Spurti" Button to Samagama Dashboard

> **⚠️ DEPRECATED (2026-06-29)** — This HMAC-based auth handoff has been **retired**.
> Samagama deleted the shared `SPURTI_AUTH_SECRET`, so the flow below verifies
> against an empty secret and 401s every student. **Do not reintroduce.**
>
> **Current auth (live since 2026-06-29):** Spurti lives at `samagama.in/spurti`
> (same origin as Samagama), so the browser already carries the student's
> `chatengine_token` cookie. Spurti forwards that cookie to Samagama's internal
> `/api/auth/me` endpoint (`SAMAGAMA_AUTH_URL`, default
> `http://127.0.0.1:5001/api/auth/me`) to validate the session. No token in the
> URL, no shared secret, no login page. See `CONTEXT.md` §Auth and `HOW_TO_USE.md`
> for the current flow.
>
> This file is preserved as historical context for the HMAC implementation only.

## Overview

This document describes what needs to be done to add a "My Spurti →" button in the Samagama student dashboard. When clicked, the button redirects the logged-in student to their Spurti (Summership SP) dashboard without requiring them to log in again.

---

## Architecture

```
Student clicks "My Spurti →"
        │
        ▼
Samagama server generates HMAC-signed token
        │
        ▼
Redirect to /spurti/auth?token=<signed_token>
        │
        ▼
Spurti validates token, sets cookie, shows SP dashboard
```

### Why this approach?

- Email is **never exposed** in the URL
- Token is **HMAC-signed** — cannot be forged without knowing `SPURTI_AUTH_SECRET`
- Student gets **seamless access** to spurti from within samagama dashboard
- No shared credentials needed in opposite direction (spurti keeps its secret)

---

## Two Parts

### Part A: Spurti side (Sakshi does this)

**File:** `/home/sakshi/spurti/server/server.js`

**Add a new internal endpoint** that samagama's server can call from `localhost:5003`:

```
GET http://localhost:5003/api/spurti/generate-auth-token?email=student@xyz.com
```

This endpoint:
1. Is called only from `127.0.0.1` (samagama server on same machine)
2. Reads the student's email from query param
3. Uses `SPURTI_AUTH_SECRET` to generate a signed auth token
4. Returns the token in JSON: `{ token: "..." }`

**Implementation:**
```javascript
// Add this route in spurti's server.js
// Only reachable from localhost — no auth token needed for server-to-server call
app.get('/api/spurti/generate-auth-token', async (req, res) => {
  const { email } = req.query;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  // Generate signed token (reuse existing signValue function)
  const body = Buffer.from(JSON.stringify({
    email: normalizeEmail(email),
    exp: Date.now() + 5 * 60 * 1000  // 5-minute expiry for security
  })).toString('base64url');
  const token = body + '.' + signValue(body);
  return res.json({ token });
});
```

### Part B: Samagama side (samagama user does this)

**Step 1: Read SPURTI_AUTH_SECRET from spurti's .env**

In `/var/samagama/server/server.js`, near the top where environment variables are loaded, add:

```javascript
// Read SPURTI_AUTH_SECRET from spurti's .env
const fs = require('fs');
const path = require('path');
let SPURTI_AUTH_SECRET = '';
try {
  const spurtiEnvPath = '/home/sakshi/spurti/.env';
  const envContent = fs.readFileSync(spurtiEnvPath, 'utf8');
  const match = envContent.match(/SPURTI_AUTH_SECRET=([^\n]+)/);
  if (match) SPURTI_AUTH_SECRET = match[1];
} catch (e) {
  console.warn('Could not read SPURTI_AUTH_SECRET from spurti .env:', e.message);
}
```

**Step 2: Add a route to generate the auth token for the frontend**

In `/var/samagama/server/server.js`, add:

```javascript
// Generate spurti auth token for logged-in student
function signSpurtiToken(email) {
  const body = Buffer.from(JSON.stringify({
    email,
    exp: Date.now() + 5 * 60 * 1000
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SPURTI_AUTH_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

app.get('/api/spurti/generate-auth-token', requireAuth, (req, res) => {
  if (!SPURTI_AUTH_SECRET) return res.status(500).json({ error: 'secret_not_configured' });
  const email = req.user.email;
  if (!email) return res.status(400).json({ error: 'no_email' });
  const token = signSpurtiToken(email);
  return res.json({ token });
});
```

**Step 3: Add the button in the React frontend**

**File:** `/var/samagama/web-client/src/SpurtiPointsPanel.jsx`

Modify to add a "My Spurti →" link button after the SP chip:

```javascript
// In the return section of SpurtiPointsPanel.jsx
// Add after the SP chip display:

<span style={styles.spChip}>SP: {sp ?? 0}</span>

{/* Spurti Bonus Button */}
<a
  href="/api/spurti/generate-auth-token"
  target="_blank"
  rel="noopener noreferrer"
  style={{
    display: 'inline-block',
    marginTop: 12,
    marginLeft: 12,
    color: '#2563eb',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  }}
  onClick={async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/spurti/generate-auth-token', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        window.open(`/spurti/auth?token=${data.token}`, '_blank');
      }
    } catch (err) {
      console.error('Failed to get spurti token:', err);
    }
  }}
>
  My Spurti →
</a>
```

**Step 4: Build and deploy**

```bash
cd /var/samagama/web-client
npm run build
# Then restart the samagama server
pm2 restart server
```

---

## Summary of Changes

### Spurti (`/home/sakshi/spurti/`) — Sakshi does

| File | Change |
|------|--------|
| `server/server.js` | Add `GET /api/spurti/generate-auth-token` endpoint (localhost-only, server-to-server) |

### Samagama (`/var/samagama/`) — samagama user does

| File | Change |
|------|--------|
| `server/server.js` | Read `SPURTI_AUTH_SECRET` from `/home/sakshi/spurti/.env`; add `/api/spurti/generate-auth-token` route |
| `web-client/src/SpurtiPointsPanel.jsx` | Add "My Spurti →" button with fetch-to-new-tab flow |
| `web-client/` | `npm run build` to regenerate dist |

---

## Security Notes

- The token generated has a **5-minute expiry** — prevents token stealing from being useful for long
- Token is **HMAC-signed with SPURTI_AUTH_SECRET** — cannot be forged without the secret
- Email is **never in the URL** — the token goes as a query param, but it's HMAC-protected
- The internal spurti endpoint (`localhost:5003`) is only called by samagama's server, not by browsers

---

## Testing

1. Log in to samagama as a student
2. Find the "My Spurti →" button in the dashboard (near Spurti Points panel)
3. Click it — should open a new tab with the spurti dashboard showing your SP and rank
4. Verify no email appears in the URL bar
5. Check spurti's leaderboard matches what you see in the dashboard

---

## Status

- [ ] Spurti endpoint added (Sakshi)
- [ ] Samagama server updated (samagama user)
- [ ] Samagama frontend button added (samagama user)
- [ ] Build and deploy (samagama user)
- [ ] Tested and verified