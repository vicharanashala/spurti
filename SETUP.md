# Spurti - Setup & Development Guide

A student self-motivation engagement app with guild leaderboards, season rewards, leaderboards, and SP (Spurti Points) tracking.

For product background, see `README.md`.

## Prerequisites

- Node.js 18+
- MongoDB 6+ (local or remote)
- npm

## Quick Start

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Copy environment template
cp .env.example .env
# (Optional) Edit .env to set SPURTI_AUTH_SECRET to a random string

# Start MongoDB (local, with isolated dbpath so the app's data doesn't clash with anything else)
mongod --dbpath ./mongo-data --bind_ip 127.0.0.1 --port 27017

# In a new terminal: seed demo data (865 students + sample sessions)
node server/scripts/seed.js

# Start the backend (port 5290)
node server/server.js

# In a new terminal: build + serve the client (Vite dev server on :5173, proxies /api to :5290)
cd client && npm run dev
```

Open `http://localhost:5173`.

## Production Build

```bash
cd client && npm run build
node server/server.js   # Express serves dist/ as static and falls back to index.html for SPA routing
```

## Project Layout

```
spurti/
├── server/
│   ├── server.js            # Express entry, all API routes
│   ├── config.js            # Env config + safe defaults
│   ├── models/              # Mongoose models: Student, Guild, GuildInvite, SPTransaction, Season*
│   ├── services/            # Business logic: seasons, guilds, levels
│   └── scripts/seed.js      # Demo data seeder
├── client/
│   ├── src/
│   │   ├── main.jsx         # Top-level app + StudentView + tabs
│   │   ├── Guilds.jsx       # Guild tab
│   │   ├── styles.css
│   │   └── ...
│   ├── index.html
│   └── vite.config.js
├── mongo-data/              # Local Mongo data (gitignored)
├── .env.example             # Template only, never commit .env
├── .gitignore
├── package.json
└── README.md                # Product/concept background
```

## Authentication

Two paths are supported transparently:

1. **Samagama SSO** — sets a `chatengine_token` cookie. Users from this path never see a login screen.
2. **Local search-and-confirm** — student types their name or masked email in the search modal, then confirms their full email. Server sets a signed `spurti_session` cookie (HMAC-SHA256, 30 days, HttpOnly, SameSite=Lax). This cookie is used as a fallback by all authenticated endpoints.

Both paths funnel through `studentEmailFromRequest(req)` — never read cookies directly in route handlers.

## Guild System

Routes use the `/api/guilds/*` namespace (`guild` is singular, `guilds` is plural — singular is reserved for legacy endpoints that are no longer mounted).

- `POST /api/guilds` — create a guild (becomes owner). 409 on duplicate active name.
- `GET /api/guilds` — public standings: each guild's total SP + this week's SP, ranked.
- `GET /api/guilds/mine` — your own guild detail (members, weekly breakdown, top contributor, invite code, max members).
- `POST /api/guilds/:id/invite` — leader invites a student by email. 409 if guild is full.
- `GET /api/guilds/invites/mine` — your pending invites.
- `POST /api/guilds/invites/:inviteId/respond` — accept or decline. Sets `guildId` + `guildRole: 'member'` on accept.
- `POST /api/guilds/join/:code` — join any guild by its 6-char invite code. 409 if full or already in a guild.
- `POST /api/guilds/leave` — leave your guild. Owners with other members must dissolve or transfer first.

**Member cap:** every guild has `maxMembers` (default 12, min 2, max 50). Cap is enforced at invite, accept, and join-time. Dissolved guilds free their name.

## Season System

See `server/services/seasonService.js`. Seasons group students into per-season standings, and SeasonReward records carry `spBonus` (5-25 SP) awarded on claim via SPTransaction.

Admin endpoints gated by token `ADMIN_TOKEN` env var.

## Environment Variables

See `.env.example`. All have safe local-dev defaults; nothing in `config.js` is required for the app to start.

| Var | Default | Purpose |
|-----|---------|---------|
| `SPURTI_AUTH_SECRET` | `local-dev-only-change-this` | HMAC key for `spurti_session` cookie. Override in prod. |
| `SPURTI_COOKIE_SECURE` | `false` | Set `true` in production to add `Secure` flag to the cookie. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/analysis_summership` | Mongo connection string. |
| `PORT` | `5290` | HTTP port. |
| `ADMIN_TOKEN` | `vled-local-admin` | Admin API token. |

## Development Notes

- The Node server uses ES modules (`"type": "module"` in package.json). Use `import` not `require` in `server/`.
- The client uses Vite. Build output goes to `client/dist/`.
- Express falls back to serving `client/dist/index.html` for unknown non-`/api` routes (SPA routing). Unknown `/api/*` routes return HTML too — verify route existence by response Content-Type, not status.
- Mongo `updateOne()` is used instead of `student.save()` on routes that mutate Student fields, because some legacy student records lack `internshipStartDate` which trips Mongoose full-document validation. See the leave-guild handler for the canonical example.

## License

Proprietary.
