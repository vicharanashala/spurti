# Changelog

## [1.1.0] — Engagement features release

### Added

- **Weekly Report Generator** (`client/src/components/WeeklyReport.jsx`)
  Per-student weekly summary: SP gained/lost/net, attendance table, poll table,
  consistency rate, auto-generated suggestions, and a "Download PDF" button
  that opens the browser print dialog with a formatted report (no server-side
  PDF generation needed).

- **Activity Heatmap** (`client/src/components/ActivityHeatmap.jsx`)
  GitHub-style contribution grid showing daily SP activity over the last 16
  weeks. Hover tooltips show date, SP earned, and session name. Tracks active
  days, total SP, and current streak.

- **Student Search** (`client/src/components/StudentSearch.jsx`)
  Instant client-side filtering by name or email, status pills (All/Active/
  Excused), sort by SP or name, trophy league badges, rank medals for top 3,
  pagination, and email masking for student-facing privacy.

- **Analytics Dashboard** (`client/src/components/AnalyticsDashboard.jsx`)
  Admin-only dashboard: 8 stat cards (avg/max/min SP, active count, at-risk
  count, avg attendance %, avg poll %, session count), SP distribution pie,
  status breakdown donut, attendance/poll bar charts per session, weekly SP
  trend line chart, trophy league distribution bar, and an at-risk students
  table (SP < 100).

- **New pages**: `StudentDashboardPage.jsx` (student-facing) and
  `AdminAnalyticsPage.jsx` (admin-facing) wiring the above components to live
  API data via the new `useFetch` hook.

- **New server endpoints** in `server/server.js`:
  `GET /api/me`, `GET /api/leaderboard`, `GET /api/students/search`,
  `GET /api/admin/students`, `GET /api/student/:id`,
  `GET /api/student/:id/transactions`, `GET /api/student/:id/attendance`,
  `GET /api/student/:id/polls`, `GET /api/student/:id/weekly-report`,
  `GET /api/sessions`, `GET /api/admin/chat-sp-reviews`,
  `POST /api/admin/chat-sp-reviews/:id/accept`,
  `POST /api/admin/chat-sp-reviews/:id/reject`,
  `GET /api/admin/analytics/latest`.

- **New Mongoose models**: `Student`, `SPTransaction`, `Session`,
  `AttendanceRecord`, `PollRecord`, `ChatRecord`, `ChatSPReview`,
  `AnalyticsSnapshot`, `SessionEvent` — matching the schema documented in
  `CONTEXT.md`.

- **Client scaffold**: Vite + React 18 + React Router + Recharts, with a
  proxy from `/api` (port 5291) to the backend (port 5290) for local dev.

### Dependencies added

- `client/package.json`: `react-router-dom@^6.26.0`, `recharts@^2.12.7`,
  `@vitejs/plugin-react@^4.3.1`, `vite@^5.4.1`

### Notes

- `AnalyticsDashboard` exposes all student emails and SP — gate the
  `/admin/analytics` route behind admin auth before deploying.
- `StudentSearch` defaults to `allowFullSearch={false}` (masked emails); only
  the admin page passes `allowFullSearch={true}`.
