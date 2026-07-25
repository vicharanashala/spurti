# feat: Weekly Recap popup cascade + SP Trend heatmap + 16-rank system + bottom-50 recovery emails

## Summary

Adds the Monday-morning weekly recap experience: Champions popup →
Insights popup (auto-flips at 10s) → Recovery Coach popup. Plus the
desktop Weekly Leaderboard, 16-rank progression, 4×6 SP Trend heatmap,
and personalized bottom-50 recovery emails. No schema migrations on
existing collections, no SP calculation changes.

## What's new

- **FreshWeekEmpty** — "A New Weekly Challenge Has Begun!" motivational frame
- **WeeklyLeaderboardDesktop** — premium 3-column desktop shell (inline + full-page), with Top 10 popup, scrollable rank table, 6-widget right rail
- **WeeklyLearningInsightsPopup** — auto-flipping card (Top 10 on front → AI insights on back after 10s)
- **RecoveryCoachPopup** — calm AI recovery plan for bottom-50 students
- **AIRecoveryCoachPopup** — full-page equivalent for the standalone view
- **SPTrendPanel** — 4×6 heatmap + SVG trend line + slope chip, with weakest-cell click → Recovery Coach pre-focused
- **16-rank system** — Bronze III → Master (100–1500 SP), pure CSS animations
- **Recovery email mailer** — sends personalized emails to bottom-50 students on recap finalize (dry-run mode in dev, forwards to Samagama mailer when `SAMAGAMA_MAILER_URL` is set)

## Endpoints added

- `GET /api/weekly/desktop?email=…` — leaderboard + user summary
- `GET /api/weekly/recap?email=…` — recap + AI plan + case + goal + liveProgress
- `GET /api/weekly/sp-trend?email=…` — trend + heatmap + summary

## Files changed (6 commits)

- 9d44c01 — feat: send weekly recovery emails to bottom-50 students on recap finalize
- 69556c0 — fix: wire 'Got it' close button + move cross bar inside popup
- d5b05e2 — feat: local-dev auth bypass (SPURTI_DEV_AUTH=1 + ?devEmail=)
- b84ea7b — feat: add ?popups=always bypass for weekly recap popups
- 45c0b0c — feat: wire SPTrendPanel + RecoveryCoachPopup into StudentView
- 7630610 — feat: add SP Trend panel + document weekly recap popup cascade

## Local dev workflow

```bash
# 1. kill any leftover server
taskkill /F /IM node.exe

# 2. start with local auth bypass
$env:SPURTI_DEV_AUTH='1'
npm run dev

# 3. open the popup testing URL
# http://localhost:5290/spurti?devEmail=<any-student-email>&popups=always
```

## Documentation

- README.md — added summary section pointing readers to FEATURES.md
- FEATURES.md — comprehensive Part 2 with file maps and architectural decisions
