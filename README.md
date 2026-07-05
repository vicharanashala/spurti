# Spurti: Student Self-Motivation & Engagement Engine

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)
[![Stack: MERN](https://img.shields.io/badge/stack-MERN-blue.svg)](#)

---

## Executive Summary

**Spurti** is an open-source, production-ready Student Self-Motivation and Engagement Engine designed to address the problem of student disengagement and silent dropouts in large-scale learning programs. Operating as a motivation layer on top of educational activities (such as live lectures, quizzes, and discussion forums), Spurti tracks student participation in real-time, converting effort and consistency into visible motivation signals: Spurti Points (SP), levels, leagues, streaks, badges, and recovery goals. 

Rather than serving as an academic grading system, Spurti acts as a gamified self-regulation mirror. It empowers students to monitor their consistency, assists teachers and mentors in identifying disengaged students early, and helps program administrators evaluate engagement health across large cohorts.

---

## Table of Contents
1. [Core Features](#core-features)
2. [Theoretical Foundation](#theoretical-foundation)
3. [Project Architecture](#project-architecture)
4. [Documentation Suite](#documentation-suite)
5. [Installation & Usage](#installation--usage)
   - [5.1 Prerequisites](#51-prerequisites)
   - [5.2 Initial Setup](#52-initial-setup)
   - [5.3 Database Rebuild & Seeding](#53-database-rebuild--seeding)
   - [5.4 Running the Application](#54-running-the-application)
6. [Verification & Verification Checklist](#verification--verification-checklist)

---

## Core Features

- **Gamified Progression**: Features a dual-loop design separating permanent lifetime effort (**Levels**) from dynamic consistency rankings (**Trophy Leagues**).
- **Automated Processing**: Background pipeline triggers fetch participant logs and calculate attendance/poll bands without manual intervention.
- **Privacy-First Directory**: Incorporates wildcard-masked student searches to protect candidate data from public exposure.
- **Survey Webhook Triangulation**: Prevents survey skips by locking the student dashboard behind Google Forms check-in webhooks.
- **Analytics Dashboard**: Gives instructors detailed analytics, including active users, average/median SP, and alert lists of students falling behind.

---

## Theoretical Foundation

Spurti is built on established educational theories:
- **Self-Regulated Learning (SRL)**: Encourages goal setting, performance self-monitoring, and active reflection.
- **Self-Determination Theory (SDT)**: Protects learner competence (via permanent Levels), autonomy (via flexible Recovery Missions), and relatedness (via onboarding groups).

For detailed research mappings and pedagogical rationale, see [RESEARCH.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/RESEARCH.md).

---

## Project Architecture

Spurti operates as a **two-half decoupled architecture**:
1. **SP Ingestion & Scoring Pipeline (pipeline/)**: A background cron service that reads Zoom logs, checks attendance intervals against thresholds, and regenerates SP transactions in MongoDB.
2. **Dashboard Server & Client (server/ + client/)**: A MERN web application that serves dashboard interfaces and fetches profile data using read-only database queries.

For visual diagrams and folder details, see [ARCHITECTURE.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/ARCHITECTURE.md).

---

## Documentation Suite

Please refer to the following documentation files for detailed specifications:

- **Product Specifications**: [PRODUCT.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/PRODUCT.md) — Product vision, personas, streak mechanics, and user journeys.
- **System Architecture**: [ARCHITECTURE.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/ARCHITECTURE.md) — Technical layouts, folder structure, and Mermaid sequence/system diagrams.
- **API Reference**: [API.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/API.md) — REST endpoints, authentication cookie forwarding, and JSON payloads.
- **Database Schema**: [DATABASE.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/DATABASE.md) — MongoDB schema definitions, text indexes, and Mermaid ER diagrams.
- **Scoring Rubric**: [SCORING.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/SCORING.md) — Learning Energy algorithms, mathematical formulas, and banded tiers.
- **UI Mockups**: [UI.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/UI.md) — ASCII-art wireframes for Student/Teacher dashboards and alerts.
- **Implementation Roadmap**: [ROADMAP.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/ROADMAP.md) — Timeline phases, success metrics, and future integrations.
- **Pedagogical Research**: [RESEARCH.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/RESEARCH.md) — Academic mapping to Self-Regulated Learning (SRL) literature.
- **Contributing Guide**: [CONTRIBUTING.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/CONTRIBUTING.md) — Coding conventions, local environment setup, and PR guidelines.
- **Release Changelog**: [CHANGELOG.md](file:///d:/Summer%20Internship%20IIT%20Ropar/spurti_project/spurti_nitesh/CHANGELOG.md) — Version history, scoring migration logs, and bug fix summaries.

---

## Installation & Usage

### 5.1 Prerequisites
Before setting up, ensure you have the following installed:
- Node.js LTS (v18 or v20 recommended)
- npm
- MongoDB Community Server running locally on port 27017

### 5.2 Initial Setup
1. Clone the repository and install dependencies:
   ```bash
   npm run setup
   ```
2. Create your local environment configuration:
   ```bash
   cp .env.example .env
   ```
3. Set the variables inside `.env`:
   ```env
   PORT=5290
   MONGO_URI="mongodb://127.0.0.1:27017/analysis_summership"
   ALLOW_STUDENT_SEARCH=true
   ```

### 5.3 Database Rebuild & Seeding
To populate your local MongoDB with default student data, sessions, and transaction ledgers:
```bash
npm run rebuild
```

### 5.4 Running the Application
To run the server and frontend concurrently in development mode:
```bash
npm run dev
```
Open your browser and navigate to:
- MERN Web Portal: `http://localhost:5290`
- React Vite Hot Reload: `http://localhost:5291`

---

## Verification & Verification Checklist

To confirm code and documentation stability:
- Ensure the project builds successfully by running `npm run build`.
- Validate that all markdown files render correctly and cross-file links are intact.
- Verify that index and text search functions on `Student` schemas behave as expected on local database queries.
