# ROADMAP.md - Spurti Implementation Roadmap & Future Scope

## Table of Contents
1. [Implementation Phases](#1-implementation-phases)
   - [Phase 1: Foundation & Reliability (Current State)](#phase-1-foundation--reliability-current-state)
   - [Phase 2: Enhanced Ingestion & Scalability](#phase-2-enhanced-ingestion--scalability)
   - [Phase 3: Automated Actions & Gamification Loops](#phase-3-automated-actions--gamification-loops)
   - [Phase 4: Multi-Channel Integrations](#phase-4-multi-channel-integrations)
2. [Target Timeline](#2-target-timeline)
3. [Future Scope & Feature Extensions](#3-future-scope--feature-extensions)
4. [Long-Term Evolution](#4-long-term-evolution)

---

## 1. Implementation Phases

```
+───────────────────────+     +───────────────────────+     +───────────────────────+
│       PHASE 1         │     │       PHASE 2         │     │       PHASE 3         │
│ Foundation & Ledger   ├────>│ Scalability & Forms   ├────>│ Gamification & Alarms │
│ - Band/Tier Rubrics   │     │ - Sheet Sync Scripts  │     │ - Real Streak engine  │
│ - Mirroring pipeline  │     │ - Multi-Survey Popup  │     │ - Active Recovery UI  │
+───────────────────────+     +───────────────────────+     +───────────────────────+
```

### Phase 1: Foundation & Reliability (Current State)
- **Database Architecture**: Setting up the MERN database schemas with text indexes for fast lookups.
- **Scoring Pipeline Migration**: Moving calculations away from API servers. Transitioning from binary $\pm 5$ models to automated **10/5/3/0** scoring bands.
- **Mirroring System**: Setting up read-only local mirrors of candidates and Zoom participant tables.
- **Authentication**: Implementing Samagama auth cookie forwarding.

---

### Phase 2: Enhanced Ingestion & Scalability
- **Google Sheet Sync Integration**: Completing Apps Script webhooks to synchronize Google Forms responses to local database collections.
- **Multi-survey configuration**: Launching survey configuration tools (e.g. `SURVEY` and `POLL2`) from backend variables without client rebuilds.
- **Automatic Roster Syncing**: Setting up nightly triggers to sync new candidates without dropping existing transaction logs.

---

### Phase 3: Automated Actions & Gamification Loops
- **Streak Calculation Service**: Rewriting streak calculations as a backend service that stores results in the student schema instead of processing them client-side.
- **Recovery Missions Panel**: Building a dedicated recovery interface. Allowing at-risk students to claim specific attendance and poll missions to earn SP bonuses.
- **Discretionary Review Enhancements**: Upgrading natural language processing in `ingestChat.js` to automatically extract questions and evidence for review.

---

### Phase 4: Multi-Channel Integrations
- **Discourse Trust Level integration (Rubric Part D)**: Integrating with community forums. Awarding SP points based on Discourse likes, replies, and community trust badges.
- **WhatsApp Nudge Integration (Rubric Part F)**: Sending direct WhatsApp messages when students drop into the Silver or Bronze leagues.
- **Zoom AI Summarizer Integration**: Scanning Zoom transcripts using LLM APIs to automatically award bonus SP to students who ask good questions during live sessions.

---

## 2. Target Timeline

| Iteration | Component | Milestone Deliverables |
|---|---|---|
| **Week 1-2** | Foundations | Finalizing pipeline scripts, MongoDB indexing, and Samagama cookie gates. |
| **Week 3-4** | Scalability | Launching Google Forms webhook, implementing automatic email verification, and testing survey modal blockers. |
| **Week 5-6** | Gamification | Deploying the Streak service, updating the database with highest SP records, and building recovery tasks. |
| **Week 7+** | Integrations | Linking Discourse API, configuring WhatsApp alerts, and executing end-to-end dry-run tests. |

---

## 3. Future Scope & Feature Extensions

1. **Auto-excuse validation**: Upgrading the roster management dashboard to parse medical certificate attachments and automatically freeze attendance checks.
2. **Predictive Dropout Analysis**: Implementing machine learning algorithms (such as Logistic Regression) to analyze students' SP trends and identify those likely to drop out before they lose momentum.
3. **Weekly Progress Reports**: Setting up an automated email service that sends students a weekly summary of their SP gains, losses, and active recovery goals.

---

## 4. Long-Term Evolution

Spurti aims to evolve into a general-purpose, self-regulated learning (SRL) motivation layer. It can easily integrate with popular Learning Management Systems (LMS) like Moodle, Canvas, or OpenEdX:

- **LMS Plugin**: Developing a standard LTI (Learning Tools Interoperability) plugin that displays the Spurti block on any course page.
- **Multi-tenant Architecture**: Supporting multiple institutions and programs on a single database deployment.
- **Standardized API**: Providing webhook triggers so external platforms can easily credit or debit Spurti Points.
