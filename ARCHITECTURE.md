# ARCHITECTURE.md - Spurti Architecture Document

## Table of Contents
1. [Architectural Overview](#1-architectural-overview)
2. [The Two Halves Design](#2-the-two-halves-design)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Workflow & Data Ingestion Diagram](#4-workflow--data-ingestion-diagram)
5. [Folder Structure](#5-folder-structure)
6. [Data Flow & Integration Points](#6-data-flow--integration-points)

---

## 1. Architectural Overview

Spurti is designed as an asynchronous, decoupled system split into a **Web Application** and an **SP Scoring Pipeline**. The primary communication channel and single source of truth between these two components is a shared **MongoDB** instance (`sakshi_spurti`). 

By separating the ingestion and scoring engine from the web app, Spurti ensures that heavy background data operations do not degrade web user experience. Furthermore, this design isolates backend API calls to third-party services (such as the Zoom Reports API) from the student-facing presentation layer.

---

## 2. The Two Halves Design

```
                     ┌──────────────────┐
                     │   Zoom Reports   │
                     └────────┬─────────┘
                              │ cron
                              ▼
  ┌──────────────────────────────────────────────────────┐
  │ 1. SP pipeline (pipeline/)                           │
  │    - Fetches Zoom meetings, attendance, & polls      │
  │    - Rebuilds students' SP balances                  │
  │    - Writes ledger data to MongoDB                   │
  └──────────────────────────┬───────────────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │     MongoDB      │
                    │ (sakshi_spurti)  │
                    └────────┬─────────┘
                             │
                             ▼
  ┌──────────────────────────────────────────────────────┐
  │ 2. Web Application (server/ + client/)               │
  │    - Serves student and teacher dashboards           │
  │    - Read-only consumer of MongoDB (for SP details)  │
  │    - Processes manual review actions                 │
  └──────────────────────────────────────────────────────┘
```

1. **SP Pipeline (pipeline/)**: A scheduled scoring engine (configured via Linux cron) running as a background service. It executes zoom update commands, mirrors candidates' rosters, processes attendance thresholds, calculates poll attempts, applies scoring bands, and regenerates the database transaction ledger.
2. **Web Application (server/ + client/)**: A MERN stack application (React SPA + Node.js Express server) that reads student scores, displays leaderboards, processes telemetry pings, and authenticates students via Samagama cookie forwarding.

---

## 3. System Architecture Diagram

This diagram displays how third-party platforms, cron schedulers, databases, and client devices interact:

```mermaid
graph TD
    subgraph Third_Party["External Services"]
        Z[Zoom Reports API]
        SGM[Samagama Platform]
    end

    subgraph Cron["Cron Orchestrator"]
        C1["sp-pipeline.sh (Daily 11:15 IST)"]
        C2["sp-rubric-build.js (Nightly 02:45 IST)"]
        C3["cron-sakshi-zoom.sh (Every 6h)"]
    end

    subgraph Database["Data Store"]
        DB[(MongoDB: sakshi_spurti)]
    end

    subgraph Backend["Express Application Server (Port 5003)"]
        API[Express Routing API]
        Auth[Samagama Cookie Gate]
    end

    subgraph Frontend["React Single Page Application"]
        UI[Student & Teacher Dashboards]
    end

    %% Cron triggers
    C3 -->|Runs zoom-update.js| Z
    Z -->|Mirrors meetings & logs| DB
    C2 -->|Recomputes SP Rubrics| DB
    C1 -->|Orchestrates daily sync| DB

    %% Web Application Data Flow
    SGM -->|Provides chatengine_token| Auth
    UI -->|API Requests| API
    API -->|Validates Token| Auth
    Auth -->|Forward Validation request| SGM
    API -->|Read-only Queries| DB
    UI -->|Telemetry Pings| API
    API -->|Logs telemetry| DB
    
    style Database fill:#f9f,stroke:#333,stroke-width:2px
    style Backend fill:#bbf,stroke:#333,stroke-width:2px
    style Frontend fill:#dfd,stroke:#333,stroke-width:2px
```

---

## 4. Workflow & Data Ingestion Diagram

The following diagram tracks the sequential flow of session data, starting from when a Zoom meeting finishes to the student viewing their updated SP bank:

```mermaid
sequenceDiagram
    autonumber
    participant Z as Zoom Platform
    participant P as pipeline/ (Cron Job)
    participant DB as MongoDB (sakshi_spurti)
    participant S as server/ (Express Server)
    participant C as client/ (React UI)
    participant SGM as Samagama Auth

    Note over Z, P: Phase 1: Ingestion
    P->>Z: Request meeting, poll, and participant data
    Z-->>P: Return attendance logs & poll results
    P->>DB: Rebuild collections (zoom_attendance, zoom_polls)

    Note over P, DB: Phase 2: Scoring Calculation
    P->>DB: Fetch active candidates & internship start dates
    P->>P: Filter sessions matching standup/orientation rules
    P->>P: Apply 90/75/50% attendance & poll bands
    P->>DB: Wipe old ledger & write fresh sptransactions + update students.totalSp

    Note over C, S: Phase 3: Client Access
    C->>S: GET /api/me (Request Profile & Leaderboard)
    S->>SGM: POST /api/auth/me (Forward Cookie)
    SGM-->>S: Return user email (Authenticated)
    S->>DB: Fetch student profile, transactions, & cohort average
    DB-->>S: Return student document & ledger array
    S-->>C: Serve dashboard payload
    Note over C: Render Levels, Leagues, & Streaks
```

---

## 5. Folder Structure

The repository is structured as follows:

```text
spurti/
├── client/                      # React Frontend SPA
│   ├── public/                  # Static assets
│   ├── src/                     # React application logic
│   │   ├── main.jsx             # Combined dashboard components
│   │   └── styles.css           # Vanilla CSS styles and color tokens
│   ├── index.html               # Main entry HTML
│   ├── package.json             # Frontend script configuration
│   └── vite.config.js           # Vite server settings
├── server/                      # Express Backend Server
│   ├── models/                  # Mongoose MongoDB schemas
│   │   ├── AnalyticsSnapshot.js # Weekly analytics logging
│   │   ├── Student.js           # Student metadata, level, league
│   │   └── SPTransaction.js     # Append-only transaction log
│   ├── services/                # Business services
│   │   ├── levels.js            # Pure level & league calculations
│   │   └── spLedger.js          # Transaction writers & readers
│   ├── config.js                # App variables & fallbacks
│   └── server.js                # Server entry, routing, and middlewares
├── pipeline/                    # Data pipeline and Scoring engine
│   ├── models/                  # Pipeline schemas
│   │   └── User.js              # Samagama mirrored User models
│   ├── sp-pipeline.sh           # Main orchestration shell script
│   ├── sp-pipeline.cron         # Production cron job specs
│   ├── sp-rubric-build.js       # Core scoring calculations (A+B bands)
│   ├── sp-rubric-build-mirror.cjs # Scoring code reading DB mirrors
│   └── sync-spurti-from-sakshi.js # Syncs SP ledger to Samagama database
├── data/                        # Local seed database files
├── package.json                 # Top-level setup and helper runner scripts
└── README.md                    # Main entry documentation file
```

---

## 6. Data Flow & Integration Points

- **Authentication**: Authenticated via the standard `chatengine_token` cookie. The web client passes cookies to `server.js` on `/api/me`. The Express server extracts the cookie and forwards it to Samagama's internal OAuth handler.
- **Scoring Pipeline**: Triggered automatically in background crons. Once computed, the data is pushed from `sakshi_spurti` into `chatengine` so that students can see their SP status directly in the Samagama chat interface.
- **Admin Review Queue**: Unused chat transcripts or manually triggered events are stored as `chatspreviews`. Instructors review these entries via `/api/admin/chat-sp-reviews` to accept or reject discretionary increments.
