# CHANGELOG.md - Spurti Version History

## Table of Contents
1. [Unreleased](#unreleased)
2. [v1.2.0 (2026-06-29) - Authentication Upgrade](#v120-2026-06-29---authentication-upgrade)
3. [v1.1.0 (2026-06-28) - Scoring Pipeline Migration](#v110-2026-06-28---scoring-pipeline-migration)
4. [v1.0.0 (2026-05-15) - Initial Release](#v100-2026-05-15---initial-release)

---

## [Unreleased]
- Improved documentation suite with deep theoretical mapping to educational research.
- Added architectural Mermaid diagrams mapping data flow and system structure.
- Documented database ER diagrams and REST API payload specs.

---

## v1.2.0 (2026-06-29) - Authentication Upgrade

### Added
- Integrated standard `chatengine_token` cookie passthrough to forward auth headers to Samagama's `/api/auth/me` endpoint.
- Handled authenticated student profile fetches directly using same-origin cookies, removing URL-based query token vulnerabilities.

### Retired
- Retired the legacy HMAC-signed URL authentication flow (`SPURTI_AUTH_SECRET` and `/spurti/auth?token=...`). 
- Removed the old `spurti_student` signed cookie configuration to resolve student login verification failures (preventing the 29 June outages).

---

## v1.1.0 (2026-06-28) - Scoring Pipeline Migration

### Added
- Created the new, background mirror-based scoring pipeline in `pipeline/sp-rubric-build-mirror.cjs`.
- Implemented **10/5/3/0** scoring bands for session attendance and poll participation.
- Added biweekly cohort groupings (`leaderboardGroup`) based on student start dates.
- Enabled automatic leaderboard cleaning during sync runs to remove stale entries and duplicate rosters.

### Changed
- Moved the scoring logic from Express API scripts to background cron jobs, making the web server a read-only consumer of MongoDB scores.
- Switched data sources from live API queries to localized MongoDB mirrors, resolving connection errors and data loss on sessions older than 4 weeks.

### Retired
- Retired the legacy $\pm 5$ binary scoring logic in `server/scripts/` that was driven by manual CSV uploads.

---

## v1.0.0 (2026-05-15) - Initial Release

### Added
- Implemented the core Student Motivation Engine with points (SP), levels, leagues, and search modals.
- Set up administrative control views including stats checks and attendance grids.
- Added telemetry heartbeats to log student activity on dashboard pages.
