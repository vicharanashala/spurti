# Spurti — Student Self-Motivation Engine

## Quick Start

```bash
# 1. Clone and install
npm install
npm --prefix client install

# 2. Configure
cp .env.example .env        # edit .env — set MONGO_URI at minimum
# Default server port is 5290. Change with PORT=5290 in .env

# 3. Seed the database
npm run rebuild

# 4. Build and run
npm run build               # builds client/
node server/server.js       # serves on http://localhost:5290/spurti
```

For Google Sheets sync and other pipeline tools, see the [Pipeline README](pipeline/README.md).

---

## What Is This?

Spurti is a student self-motivation and engagement engine for structured learning journeys — internships, courses, bootcamps, or any program where consistency and completion matter.

It gives students visible motivation signals (points, streaks, progress bands, badges) and gives educators early visibility into who's engaged and who might need support.

## Tech Stack

- **Frontend:** React + Vite, served as a static SPA by Express
- **Backend:** Express API (Node.js ESM)
- **Database:** MongoDB + Mongoose
- **Auth:** Samagama SSO cookie (dev mode accepts `?asEmail=` param)

## Project Structure

```
client/src/           React components and styles
client/dist/          Built static assets (gitignored, rebuilt on deploy)
server/
  models/             Mongoose schemas (Student, SPTransaction, Session, …)
  routes/             API routers (weekly-leaderboard, ghost-race, faction-war, …)
  services/           Business logic (levels, progress, skillTree, …)
  scripts/            One-off dev/admin scripts (seed, rebuild, ingest, …)
pipeline/             Google Sheets sync, Zoom ingestion, data pipeline utils
data/                 Local staging exports (gitignored — contains student PII)
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5290` | Server port |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `SAMAGAMA_AUTH_URL` | No | — | Samagama SSO endpoint |
| `ALLOW_STUDENT_SEARCH` | No | `false` | Enable `/api/search` for unauthenticated name/email lookup |
| `ADMIN_EMAIL` | No | `dled@iprr.ac.in` | Admin identity for header-based auth |
| `ADMIN_TOKEN` | No | `vled-local-admin` | Admin token for header-based auth |

See `.env.example` for all options.

## Key Features

- **Spurti Points (SP)** — lifetime points earned through sessions, polls, and achievements
- **Weekly Leaderboard** — SP earned this week, reset every Monday
- **Ghost Race** — race against your past week's performance
- **Skill Tree** — spend SP to unlock decorative title nodes
- **Wrapped** — monthly progress story with attendance, polls, and SP breakdown
- **Faction Wars** — students belong to one of four factions; weekly team competition

## API Overview

| Endpoint | Description |
|---|---|
| `GET /api/me` | Student profile + transactions + cohort data |
| `GET /api/weekly-leaderboard` | This week's SP leaderboard |
| `GET /api/ghost-race` | Ghost race data |
| `GET /api/skill-tree` | Skill tree unlock state |
| `GET /api/faction-war` | Faction war standings |
| `GET /api/wrapped?month=YYYY-MM` | Monthly wrapped story |
| `GET /api/search?q=` | Name/email search (requires `ALLOW_STUDENT_SEARCH=1`) |

## Running in Production

```bash
# Set env
PORT=5290
NODE_ENV=production
MONGO_URI=mongodb://...

npm run build          # client build
node server/server.js  # starts on PORT (default 5290)
```

The Express server handles both API and static file serving; no separate Nginx config needed.

---

## Educational Motivation Model

Spurti encourages students through four connected loops:

- **Awareness** — students see where they stand
- **Action** — small, regular learning actions earn rewards
- **Feedback** — visible points, badges, and progress signals
- **Recovery** — clear paths to restart after low engagement

The system is designed to support self-regulated learning: goal-setting, self-monitoring, reflection, and recovery — without replacing academic grading.

For educators, it provides early signals about which students are active, improving, or need support — before disengagement becomes dropout.

## Success Metrics

- Course/program completion rate
- Weekly active learner rate
- Improvement in student consistency over time
- Reduction in silent dropout
- Educator ability to identify at-risk students earlier