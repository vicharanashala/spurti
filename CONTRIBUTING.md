# CONTRIBUTING.md - Spurti Contributor Guidelines

## Table of Contents
1. [Code of Conduct](#1-code-of-conduct)
2. [Development Environment Setup](#2-development-environment-setup)
3. [Coding & Documentation Standards](#3-coding--documentation-standards)
4. [Testing & Verification](#4-testing--verification)
5. [Pull Request Submission Checklist](#5-pull-request-submission-checklist)

---

## 1. Code of Conduct

As contributors and maintainers of the Spurti project, we are committed to providing an open, welcoming, and supportive environment for all learners, mentors, and developers. All contributions must focus on positive reinforcement, transparency, student privacy, and educational research integrity.

---

## 2. Development Environment Setup

To set up a local development environment, follow these steps:

### Prerequisites
- **Node.js**: LTS version (v18 or v20 recommended)
- **MongoDB**: Community Server (v6.0 or higher) running locally on port 27017

### Installation
1. Clone the repository and install root dependencies:
   ```bash
   git clone https://github.com/nit1914/spurti_nitesh.git
   cd spurti_nitesh
   npm run setup
   ```
   *Note: `npm run setup` automatically installs node dependencies for the backend and client, and builds the client package.*

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

3. Configure variables inside the `.env` file:
   - `MONGO_URI`: `mongodb://127.0.0.1:27017/analysis_summership` (for local tests)
   - `PORT`: `5290` (default Express web app port)
   - `ALLOW_STUDENT_SEARCH`: `true` (enables student search modals locally)

### Seed local Database
Populate your local MongoDB with test data from theChecked-in roster and logs:
```bash
npm run rebuild
```

### Running the App
- Run both client and backend servers in development mode:
  ```bash
  npm run dev
  ```
- Access the local portal:
  - Backend and Express SPA: `http://localhost:5290`
  - React Vite Dev Server: `http://localhost:5291`

---

## 3. Coding & Documentation Standards

- **JavaScript Style**: Use ES Modules (ESM) syntax for server imports (e.g. `import express from 'express';`) and standard CommonJS (`require()`) inside pipeline scripts. Keep code format consistent with Prettier.
- **Frontend Architecture**: Keep the React SPA simple. Do not introduce complex state libraries (like Redux) or router frameworks unless approved. Avoid Tailwind CSS class names unless explicit request is made.
- **Database Modifiers**: Never modify student points balances (`totalSp`) directly in route handlers or API endpoints. All SP updates must go through `sptransactions` append-only logs. Use Mongoose index mappings on lookup fields.
- **Privacy Standard**: Ensure all student emails displayed on public pages are masked using the `maskEmail` helper.

---

## 4. Testing & Verification

Before submitting code changes, perform the following validation steps:

1. **Lint Checks**: Run ESLint to check for syntax errors and warnings:
   ```bash
   npm run lint
   ```
2. **Build Test**: Ensure the frontend compiles successfully:
   ```bash
   npm run build
   ```
3. **Database Integrity Audit**:
   - Compare a sample student's `totalSp` value in the `students` collection with the sum of `appliedDelta` in the `sptransactions` collection.
   - Verify that the `/api/leaderboard` API response returns the same `totalSp` values as the database records.

---

## 5. Pull Request Submission Checklist

When opening a Pull Request, verify that you have completed the following:

- [ ] All code changes follow the repository styling guidelines.
- [ ] No credential files (`.env`) or temporary logs have been committed.
- [ ] All new endpoints are documented in `API.md` with request/response payloads.
- [ ] Any modifications to collections schemas are updated in `DATABASE.md`.
- [ ] All Mermaid diagrams (architecture, workflows, ERDs) render correctly.
- [ ] Commits follow the **Conventional Commits** specification (e.g., `feat(api): add survey status endpoint`, `docs(database): update ER diagram`).
