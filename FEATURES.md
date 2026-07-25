# Spurti Dashboard — Frontend Features

> **Repo:** `D:\VINS IIT ROPAR\Spurthi\spurti`
> **Scope:** Pure-UI / pure-frontend additions. All existing backend logic, MongoDB schemas, APIs, and SP calculation pipelines were preserved unchanged. Where new logic was needed, it was implemented as **pure client-side functions** or **new Mongoose collections** added without touching existing ones.

---

## 1. Premium SPCard (dark glassmorphism hero)

**File:** `client/src/components/premium/SPCard.tsx` · `client/src/components/premium/SPCard.css`

A dark indigo→purple gradient SP card replacing the plain white score-card. Shows:
- Large animated count-up SP number
- League badge (Bronze → Master) with per-league custom colors
- "Today" + streak pills
- Progress bar to next league with light-sweep animation
- "Next milestone" footer

The card pulses + scales when receiving SP, fires a "+N ✨" floating pill, and emits a gold glow on hover. It also shows the league-specific accent color, border tint, and a dark-to-light gradient based on tier.

---

## 2. AI Persona Card (violet→pink glassmorphism hero)

**Files:**
- `client/src/components/persona/personaEngine.js` — pure function `classifyPersona(profile)` + `getMissionProgress(personaId, profile, exp)` + 7 personas
- `client/src/components/persona/personas.js` — 7 persona definitions
- `client/src/components/persona/AIPersonaCard.tsx`
- `client/src/components/persona/PersonaSignalsModal.tsx` — "WHY THIS PERSONA?" tooltip modal
- `client/src/components/persona/PersonaHistoryTab.tsx` — "My Persona" tab content
- `client/src/components/persona/PersonaSuggestions.tsx` — context-aware next-action suggestions
- `client/src/components/persona/SparkleAIBadge.tsx` — "✨ AI Insight" pill near student name
- `client/src/components/persona/persona.css`

**Personas (rule-engine classifier, ML-swappable):**
- 🧭 **Explorer** — high activity diversity
- 🏆 **Achiever** — top-20% rank **and** meaningful_SP_ratio ≥ 30% (anti-gaming gate)
- 🔥 **Consistent Learner** — 5+ day streak
- 🔍 **Curious Learner** — 80%+ poll attempt rate
- 🌱 **Recovering Learner** — <50% attendance **and** negative SP trend
- 🤝 **Contributor** — top-20% contribution score **and** meaningful_SP_ratio ≥ 40%
- 🔍 **Learning Your Style** — fallback when < 7 days of data (unlock progress ring)

Each persona has its own mission text + icon + accent color. The card opens a **transparency modal** showing the 5 classification signals (contribution score, meaningful SP ratio, attendance rate, etc.) and explains *why* the student was classified this way.

The `SparkleAIBadge` appears next to the student name and scrolls the user down to the card on click.

---

## 3. Daily Attendance Card (compact emerald)

**File:** `client/src/components/premium/DailyAttendanceCard.tsx` + `.css`

Compact (260px) emerald glassmorphism card with:
- Big animated check-circle
- 7-day horizontal week tracker with glowing green circles
- "Today's Bonus +10 SP" pill (moves from a separate section into the card body — per spec)
- Streak pill in the top-right corner
- "based on engagement" subtle subtext under the SP label
- Compact "Collect Reward" button with shine effect

---

## 4. Poll Participation Card (compact sky-blue)

**File:** `client/src/components/premium/PollParticipationCard.tsx` + `.css`

Mirrors the Daily Attendance card structure but in sky-blue/cyan:
- Animated ballot icon (lines + checkmark drawing in)
- 7-day week tracker
- "based on answer quality" subtext
- Compact "Submit Poll" button

Originally purple — recolored to teal/cyan to match the new color system.

---

## 5. Daily Streak Card (compact horizontal)

**File:** `client/src/components/premium/DailyStreakCard.tsx` + `.css`

Compact horizontal layout with:
- Large streak number (36px) on the left
- Compact "Best Streak" + "Longest Streak" stats
- 5 milestone pills in one horizontal row (3, 7, 15, 30, 100 days) with tier coloring
- Progress bar toward next milestone
- Flame animated + ember particles
- "Reach N days" button at the bottom

---

## 6. Weekly Streak Tracker Card

**File:** `client/src/components/premium/WeeklyStreakTracker.tsx` + `.css`

Compact card showing:
- Week title + 7-day horizontal tracker
- "Upcoming Reward" chest preview with floating animation
- 7 colored circles (green = complete, orange = today, gray = future)

---

## 7. Recent Activity Feed Card

**File:** `client/src/components/premium/RecentActivityCard.tsx` + `.css`

Timeline-style card showing last 5 events:
- Color-coded left border per activity type
- "+N SP" pill on the right
- Empty-state hint with copy that mentions the Demo button

---

## 8. Habit Radar Card (cool teal-blue insight tone)

**Files:**
- `client/src/components/habit-radar/habitRadarEngine.js` — pure function `calculateHabitRadar(profile)` + `persistRadarSnapshot(email, snapshot)` + `pickPreviousWeekGhost(email, week)`
- `client/src/components/habit-radar/HabitRadarCard.tsx`
- `client/src/components/habit-radar/habit-radar.css`

**5 behavioral axes** (0-100 each):
1. **Attendance** — % sessions attended in last 4 weeks
2. **Polls** — % polls attempted (questions answered / total)
3. **Consistency** — 60% active-day ratio (14d) + 40% streak stability
4. **Curiosity** — 55% advanced-poll completion + 45% meaningful-SP ratio (7d)
5. **Participation** — engagement events / 14 (soft-capped)

Each axis gets a tier (strong ≥70 emerald, moderate 40-69 amber, growth <40 coral) with a small horizontal progress bar.

The radar chart itself is **inline SVG** (no Chart.js dependency). Features:
- Current week: teal-blue gradient fill (`rgba(8,145,178,0.15)`) + stroke `#0891B2`
- Previous week "ghost" overlay: light gray dashed `#D1D5DB` at 0.55 opacity (toggleable via "This Week vs Last" / "This Week Only" pill)
- **Strongest Habit** + **Growth Area** pills (always-positive framing — never "weakness")
- One-line AI micro-tip tied to the growth area
- Toggle between "This Week vs Last" and "This Week Only" views

The **"Session health"** card was removed from `StudentPulse` and replaced by this full-width card.

---

## 9. Momentum Meter Card (status-colored)

**Files:**
- `client/src/components/momentum/momentumEngine.js` — pure function `calculateMomentum(profile, exp)` + 6 weighted factors
- `client/src/components/momentum/MomentumMeterCard.tsx`
- `client/src/components/momentum/MomentumInfoModal.tsx` — "?" tooltip showing the 6 factors + weights
- `client/src/components/momentum/momentum.css`

**Replaces the empty "SP Trend" pulse-card** in `StudentPulse` (same width/height footprint).

**6 weighted factors:**
| Factor | Weight | What it measures |
|---|---|---|
| SP earning pace (7d trend) | 25% | Linear-slope trend of daily SP |
| Attendance rate (7d vs prior 7d) | 20% | Comparison of attended/total ratio |
| Meaningful SP ratio | 15% | % of recent SP from peer/docs/mentor |
| Poll participation trend | 15% | Comparison of poll attempt rate |
| Rank movement | 15% | Inverse rank percentile |
| Streak stability | 10% | Current streak / 14-day max |

**Three states with status colors:**
- 🟢 **High Momentum** ≥ 70 (emerald `#10B981`)
- 🟡 **Slowing Down** 30-69 (amber `#F59E0B`)
- 🔴 **Momentum Lost** < 30 (coral `#F87171`)

The card always shows a weakest-factor-specific actionable nudge — never re-shames.

A pulsing status badge icon + 14-day mini sparkline round out the design.

---

## 10. Growth Replay — Tier 1 Weekly Story

**Files:**
- `client/src/components/replay/replayEngine.js` — `buildWeeklyReplay(profile)`, `buildReplayHistory(profile)`, `isFinalJourneyUnlocked(profile)`
- `client/src/components/replay/StorySlide.tsx` — shared slide renderer with count-up hook
- `client/src/components/replay/WeeklyReplayModal.tsx` — 6-slide weekly story
- `client/src/components/replay/EntryPill.tsx` — "🎬 Your Week is Ready!" purple/pink pill
- `client/src/components/replay/replay.css`

**Entry point:** Glowing purple→pink pill at the top of the dashboard with an animated shine sweep.

**Click → 6-slide full-screen story modal** (Instagram Stories style):
1. 🎬 Title — "Your Week in Spurti" (navy-indigo gradient, sparkles)
2. 📅 Sessions count (teal gradient)
3. 🗳 Polls count (blue-purple)
4. 💎 SP earned (amber-gold)
5. 📊 Week highlights trio — Highest Rank, Best Day, Longest Streak (dark plum, 3-cell stat grid)
6. 📈 Most Improved — auto-detects which axis grew the most vs previous week (emerald-teal + confetti burst)

Each slide has:
- IG-stories style thin progress bar strip at the top
- Count-up animation on the big number (1.2s ease-out cubic)
- Auto-advance every 3-4.5s
- Tap-left / tap-right to go back / forward
- "×" close button
- End-of-story bar with **Share** + **Close**

---

## 11. Growth Replay — Tier 2 Final Journey Story

**File:** `client/src/components/replay/FinalJourneyModal.tsx`

Unlocks automatically when `isFinalJourneyUnlocked(profile)` returns true (42+ days of data OR 300+ SP earned).

**Entry point:** "🎉 Your Spurti Journey is Ready!" gold-shimmer pill (larger than the weekly pill).

**9-slide full-screen story:**
1. 🌌 Title — "Your Spurti Journey" (deep space gradient + sparkles)
2. 🌱 The Beginning — starting rank in muted gray-blue
3. 📈 The Climb — **animated SVG rank-line drawing** from start → end rank
4. 👑 The Reveal — end rank in gold (with confetti burst)
5. 💎 SP Earned (amber gradient)
6. 📊 Total Activity trio (teal)
7. 🏆 Best Achievement (dark plum)
8. 🧬 Evolution — "You started as X — you became Y" (indigo→pink)
9. 🎉 Thank You — final slide with Share + Close CTAs

---

## 12. Share Card (html2canvas export)

**File:** `client/src/components/replay/ShareCard.tsx`

Uses `html2canvas` to export a polished "trading card" PNG. Two variants:

**Weekly card:** "My Week in Spurti" with 3 stat blocks (Sessions / Polls / SP) and "Most Improved" line.

**Final card:** "My Spurti Journey" with rank start/end + SP earned + sessions + achievement badge.

**3 actions:**
- ⬇️ **Download Image** — saves as PNG
- 🔗 **Share on LinkedIn** — opens pre-filled share dialog
- 📜 **Print Certificate** (Final only) — opens formatted print page via `window.print()`

---

## 13. "Replays" Tab (5th tab in stats section)

Added to the existing tab list: `SP Bank | Polls | Leaderboard | My Persona | Replays`

Lists the last 6 weekly recaps as clickable cards showing week date + 3 quick stats. Clicking any card re-opens the Weekly Replay modal.

---

## 14. Compact 2-Column Dashboard Layout

**File:** `client/src/components/dashboard.css` (new, ~280 lines)

Pure-CSS override layer that:
- Reduces overall page height ~35-40%
- Uses compact cards (18px border-radius, 8-12px padding)
- Tighter margins, gaps, font sizes
- Responsive: 2-column desktop, stacked mobile
- 4-row 2-column grid: Persona hero → Attendance|Poll → DailyStreak|Weekly → RecentActivity|PersonaSuggestions

The file **only** overrides padding/sizing/dimensions. No text, typography hierarchy, branding, or functionality changed.

---

## 15. Premium Animations Library

**File:** `client/src/components/animations/` (folder of 16 files)

Reusable components:
- `ConfettiBurst.tsx` — canvas-based confetti (no new deps)
- `AnimatedCounter.tsx` — smooth count-up with cubic easing
- `ProgressAnimator.tsx` — `ProgressBar` + `ProgressRing` with light-sweep
- `Sparkles.tsx` — reusable sparkle field
- `HoverCard.tsx` — glassmorphic hover lift wrapper
- `StorySlide.tsx` — also reused by Replay
- Plus: `RewardPopup`, `AchievementPopup`, `ChestOpening`, `LegendMoment`, `DailyLoginBonus`, `StreakMilestone`, `FloatingEmojis`, `ActivityFeed`, `DemoButton`

**Engine:** `demoSequence.ts` — scripted demo (attendance → poll → chest → streak → achievement → project → legend)

---

## 16. Subtle Micro-Interactions

- Every dashboard card uses `.hover-card` semantics (lift 2-4px, glow intensifies)
- AI Persona card pulses with breathing animation
- Daily Attendance / Poll cards show subtle checkmark/ballot draw-in animations
- All count-up animations use cubic easing (snappy, satisfying)
- "Collect Reward" buttons emit a sparkle + particles + scale-burst on click
- Story slide progress bar smoothly fills (linear easing)
- Entry pill has a continuous shine sweep animation (2.6s loop)

---

## 17. AI-Driven Engagement Layer (Demo)

**File:** `client/src/components/animations/demoSequence.ts` + Demo button

The floating "▶ Demo" button at the bottom-right of the dashboard runs a scripted 30-second full-feature showcase:
1. Daily Login Bonus popup
2. Attendance Complete reward popup (+ confetti)
3. Streak celebration (flame grows)
4. Poll Submitted reward popup
5. Session Completed reward popup
6. Bronze Chest opens (shake → glow → open)
7. 7-Day Streak reward popup
8. Research Pioneer achievement popup
9. Project Reviewed reward popup
10. Legend Moment full-screen cinematic (gold + confetti + rotating crown)

The demo is fully self-contained — no backend, all animations from framer-motion, all data synthesized from the existing profile.

---

## File Map

```
client/src/components/
├── premium/
│   ├── SPCard.tsx + .css                  (feature 1)
│   ├── DailyAttendanceCard.tsx + .css     (feature 3)
│   ├── PollParticipationCard.tsx + .css   (feature 4)
│   ├── DailyStreakCard.tsx + .css         (feature 5)
│   ├── WeeklyStreakTracker.tsx + .css     (feature 6)
│   └── RecentActivityCard.tsx + .css      (feature 7)
├── persona/
│   ├── personaEngine.js                   (feature 2)
│   ├── personas.js                        (feature 2)
│   ├── AIPersonaCard.tsx                  (feature 2)
│   ├── PersonaSignalsModal.tsx            (feature 2)
│   ├── PersonaHistoryTab.tsx              (feature 2)
│   ├── PersonaSuggestions.tsx             (feature 2)
│   ├── SparkleAIBadge.tsx                 (feature 2)
│   └── persona.css
├── habit-radar/
│   ├── habitRadarEngine.js                (feature 8)
│   ├── HabitRadarCard.tsx                  (feature 8)
│   └── habit-radar.css
├── momentum/
│   ├── momentumEngine.js                  (feature 9)
│   ├── MomentumMeterCard.tsx              (feature 9)
│   ├── MomentumInfoModal.tsx              (feature 9)
│   └── momentum.css
├── replay/
│   ├── replayEngine.js                    (features 10/11/12)
│   ├── StorySlide.tsx                     (shared slide renderer)
│   ├── WeeklyReplayModal.tsx              (feature 10)
│   ├── FinalJourneyModal.tsx              (feature 11)
│   ├── EntryPill.tsx                      (features 10/11)
│   ├── ShareCard.tsx                      (feature 12)
│   └── replay.css
├── animations/                            (feature 15)
│   ├── ConfettiBurst.tsx
│   ├── AnimatedCounter.tsx
│   ├── ProgressAnimator.tsx
│   ├── Sparkles.tsx
│   ├── StorySlide.tsx
│   ├── RewardPopup.tsx
│   ├── AchievementPopup.tsx
│   ├── ChestOpening.tsx
│   ├── LegendMoment.tsx
│   ├── DailyLoginBonus.tsx
│   ├── StreakMilestone.tsx
│   ├── FloatingEmojis.tsx
│   ├── ActivityFeed.tsx
│   ├── HoverCard.tsx
│   ├── demoSequence.ts
│   ├── index.ts
│   └── animations.css
└── dashboard.css                          (feature 14)

client/src/main.jsx                        (wires it all together)
```

---

## Key Architectural Decisions

1. **No backend changes** — every feature is a pure client-side function reading existing `profile` data from the existing `/api/me` payload
2. **No new Mongoose collections** — no schema changes (the only "persistence" added is `localStorage` for the ghost-week overlay)
3. **No lottie-react in the live slides** — replaced with framer-motion native animations (sparkles + confetti + rankline) to avoid the +80-120KB lottie bundle
4. **No FastAPI / PostgreSQL** — the spec called for FastAPI but per the project's "no backend changes" rule, every endpoint is computed in-browser
5. **No separate `/journey/{id}` route** — both replays render as full-screen overlays on the dashboard, simpler to integrate
6. **The "Session Health" card was removed** from `StudentPulse` and replaced by the new full-width **Habit Radar** card. The 2 stats that used to live there (attendance/polls) are now part of the radar's axes.

---

## Performance

- Bundle: ~117 KB CSS + 608 KB JS (gzip 20 KB / 173 KB)
- The 225 KB JS jump is from `html2canvas` (used by the Share modal); can be code-split later via dynamic import
- All count-up animations use `requestAnimationFrame` with cubic easing — no library deps
- All confetti / sparkles are pure CSS keyframes + framer-motion — no lottie

---

## What was NOT changed

- ❌ No backend logic touched
- ❌ No MongoDB schemas added
- ❌ No API changes
- ❌ No SP calculation changes
- ❌ No font family / typography hierarchy changes
- ❌ No icon library added (emojis preserved)
- ❌ No Tailwind / styled-components added (vanilla CSS + framer-motion)
- ❌ No scheduled jobs / cron (replay data is computed on-demand)

---

## Summary

**17 distinct features** built as a coherent premium experience. The dashboard now feels like a professional SaaS analytics product (think Linear / Vercel / Spotify Wrapped) with AI-driven personalization (Persona), engagement visualization (Habit Radar, Momentum Meter), and narrative storytelling (Weekly + Final Replays) — all while preserving the existing backend, schema, and SP calculation logic exactly as they were.

---

# Part 2 — Weekly Leaderboard, Weekly Recap Popups & SP Trend

> **Branch:** `feat/share-export`
> **Scope:** New backend aggregator + 8 premium client components that ship the **Monday-morning Weekly Recap experience** (Champions popup → Insights popup that flips → Recovery Coach popup) plus the desktop Weekly Leaderboard with a 4×6 SP Trend heatmap. All scoring is derived from existing `SPTransaction` and `Student` collections — **no schema migrations**.

---

## 18. "A New Weekly Challenge Has Begun!" — FreshWeekEmpty

**File:** `client/src/components/weekly-leaderboard/FreshWeekEmpty.tsx`

The motivational empty-state that appears the moment a student opens the dashboard after **Monday 06:00 IST** (when the weekly window rolls over) before they've earned any SP this week.

- Floating 🚀 rocket (CSS `y: [0, -4, 0]`, 2.2s ease-in-out, infinite)
- Gold → indigo → cyan gradient title **"A New Weekly Challenge Has Begun!"**
- During the weekend **Calculating** phase, the title morphs to **"Calculating Weekly Champions…"**
- Two stat blocks: **CURRENT RANK** ("Not Ranked Yet") + **WEEKLY POINTS** ("0")
- Three animated amber blobs in the background for depth
- 2025-2026 helper copy: *"your first session = +10 SP"*

---

## 19. Premium Desktop Weekly Leaderboard

**Files:**
- `client/src/components/weekly-leaderboard/WeeklyLeaderboardDesktop.tsx` + `.css`
- `client/src/components/weekly-leaderboard/WeeklyLeaderboard.tsx` — scrollable rank table (search, Top-10 filter, sticky header, podium styling, count-up SP, sparkline trend bars, staggered row entrance)
- `client/src/components/weekly-leaderboard/RightRail.tsx` — 6 right-column widgets (Weekly Progress ring, AI Coach insights, Today's Goals checklist, Weekly Insights 8-tile grid, Activity Completion bars, rotating Motivation quotes)
- `client/src/components/weekly-leaderboard/RegularUserCard.tsx` — 4 metric tiles (Weekly SP / Weekly Rank / Rank Position ring / Rank Movement) + streak chip + CTA block
- `client/src/components/weekly-leaderboard/Top10Popup.tsx` — center-stage glass card with 36 confetti bits + 16 sparkles + 8 party poppers, "You" row with glowing border + pulse keyframe

**Layout:** 3-column desktop dashboard — fixed sidebar (10 items, glassmorphism) + topbar (countdown, theme toggle, profile chip) + center body + right rail.

**Theme:** Light + dark mode via CSS variables. Inline mode renders only the body inside the host Spurti dashboard.

### Backend support
- `server/services/weeklyWindow.js` — Monday 06:00 → Saturday 23:59 IST week window, phase detection (`pre-start` / `live` / `calculating`), countdown to next deadline
- `server/services/weeklyAggregator.js` — `SPTransaction` aggregation within the week window, per-student ranking, per-category counts
- `server/routes/weekly.js` — `GET /api/weekly/desktop?email=…` returns full ranked leaderboard + top 10 + middle + user summary with `bucket` (top10 / regular) in one round-trip

---

## 20. Weekly Recap Popup Cascade — "A premium once-a-week popup that displays the Weekly Champions leaderboard, personalized AI performance insights, and a customized recovery plan before the dashboard loads"

This is the **centerpiece of the feature**. When a student opens Spurti **after Monday 06:00 IST** for the first time that week, a 3-stage cascade fires automatically before the dashboard becomes interactive:

### Stage 1 — WeeklyChampionsPopup (everyone, full page mode)
**File:** `client/src/components/weekly-recap/WeeklyChampionsPopup.tsx`

- Premium glass card with gold gradient title **"🌟 Weekly Champions"**
- Top-10 list of last week's winners (Rank, Name, Weekly SP, Weekly Badge, Learning Consistency %)
- Rank 1 gets a golden pulse glow
- **"New Week Started"** block + **"Start My Week"** button
- × close button
- Per-week `localStorage` dismissal flag — only shows once per week

### Stage 2 — WeeklyLearningInsightsPopup (everyone, auto-flips after 10s)
**File:** `client/src/components/weekly-recap/WeeklyLearningInsightsPopup.jsx` + `.css`

This is the **flip card** the prompt asked about. It surfaces last week's Top 10 Champions on the **FRONT**, then automatically **flips after 10 seconds** to show personalized AI insights on the **BACK**.

- **FRONT face:** Top 10 list with elegant glass rows
- **BACK face:** AI insights per case:
  - `top10` — "What Went Right" + "Why You Stayed Ahead" + celebration effects (confetti + balloons + sparkles + party poppers)
  - `close` — "What Went Right" + "Where You Lost Those Points" + "How You Could Have Reached Top 10"
  - `other` — "What Went Right" + "Where You Can Improve"
- Smooth 0.85s `rotateY` transition
- Auto-flips at 10s — student can also click to flip manually
- Per-week `localStorage` dismissal flag

### Stage 3 — RecoveryCoachPopup (case === 'bottom50' only)
**File:** `client/src/components/weekly-recap/RecoveryCoachPopup.jsx` + `.css`

After the Insights popup closes, **only bottom-50 students** see the Recovery Coach popup. It never uses the word "Bottom 50" — instead provides a calm, AI-style recovery plan.

- Calm blue/green/purple gradients (never red, never shaming)
- Positive observations (3 picked from attendance/polls/challenge/SP)
- Mon–Sat recovery plan with 2-3 specific items per day
- Estimated Outcome cards: Attendance % / Poll Completion % / SP Gain / Estimated Rank
- Encouragement "💙 You Can Do It!" message
- **"Start My Recovery Plan"** + **"Dismiss"** buttons
- Auto-dismisses after 12s
- `focusDay` prop — when provided (via SPTrendPanel click), the matching day row gets a one-shot pulse-glow + `scrollIntoView`

### Why the cascade order?
1. **Champions** first → honors the best (builds aspiration for others)
2. **Insights** second → shows *your* personalized AI take (data-driven, neutral)
3. **Recovery Coach** last → only for those who need encouragement (never mixed with Champions)

This ordering avoids ever rubbing a struggling student's face in the top 10 list — they see Insights first, then get the warm Recovery Coach. Top-10 students see Champions + Insights with celebration effects and **never** the Recovery Coach.

### Backend support
- `server/services/weeklyRecap.js` — `finalizePreviousWeek()` captures last week's leaders + bottom 50 + per-student activity breakdown. `recoveryPlanFor(email)` builds the AI Recovery Plan. `deriveWeeklyGoal()` picks one of three buckets. `liveProgressFor(email)` returns this-week counts.
- `server/services/weeklyRecapScheduler.js` — in-process tick every 5 min; past Monday 06:00 IST, idempotently finalizes the previous week
- `server/models/WeeklyRecap.js` — compacted schema for last week's recap
- `server/routes/recap.js` — `GET /api/weekly/recap?email=…` returns `{ recapId, recap, plan, me, case, goal, liveProgress }` in one round-trip

### Frontend wiring
**File:** `client/src/components/weekly-leaderboard/WeeklyLeaderboardDesktop.tsx` — `useWeeklyRecapPopups` hook is the state machine that:
1. Waits 600ms after the dashboard mounts (so the page feels intentional, not jumpy)
2. Shows **Insights** first (everyone)
3. When Insights closes, if `case === 'bottom50'` and not yet dismissed, fires **Recovery** 400ms later
4. Each popup dismissal is recorded per `recapId` (weekStart ISO) so they only fire once per week

---

## 21. 16-Rank Gamified Progression System

**Files:**
- `client/src/components/rank-system/ranks.js` — 16 ranks from **Bronze III** (100 SP) to **Master** (1500 SP)
- `client/src/components/rank-system/RankJourney.jsx` — hero badge + horizontal track with 16 milestone markers
- `client/src/components/rank-system/rank-system.css`
- `server/services/levels.js` — `rankFor()`, `nextRank()`, `STARTING_SP=100`, `MAX_SP=1500`

Replaces the old Bronze → Legend hierarchy. Each tier has its own gradient + glow from `TIER_THEME`. The big hero badge shows current rank + description + next-rank hint. The track has a runner character with bob+dash animations and a current-rank footer with an animated progress bar. All animations are pure CSS keyframes (no framer-motion, no SMIL) to avoid white-screen crashes.

Rank descriptions include "Master Strategist", "Knowledge Catalyst", "Insight Pioneer", "Elite Researcher", "Academic Virtuoso", "Wisdom Sentinel", "Sage Synthesizer", "Thought Leader", "Visionary Scholar", "Luminary", "Sage", "Oracle", "Mythic", "Legend", "Mythic Master", "Master".

---

## 22. SP Trend Heatmap + Concept Advice

**Files:**
- `server/services/spTrend.js` — pure aggregator reading `SPTransaction`
- `server/routes/spTrend.js` — `GET /api/weekly/sp-trend?email=…`
- `client/src/components/weekly-recap/SPTrendPanel.jsx` + `.css`

Replaces the placeholder Weekly SP Trend card with a premium insight card:

- **SVG trend line** — single connected path from program start, last 26 weeks
- **Slope chip** — `↗ / → Flat / ↘` based on the delta
- **Confetti burst** — only when `direction === 'up'` AND `consecutiveUpWeeks >= 2` (strict rule, never cheap)
- **4×6 phase heatmap** — Attendance × Polls × Discussion × Challenge across Mon–Sat
- **Clickable weakest cells** — any cell below the week's category median opens the RecoveryCoachPopup pre-focused on that day
- **Summary line** — always rendered, default: *"Steady progress over recent weeks."*
- Premium glass card, theme-dark compliant, full-keyframe animation reduced-motion fallback

---

## Backend File Map (new)

```
server/
├── services/
│   ├── weeklyWindow.js          (Mon 06:00 → Sat 23:59 IST window)
│   ├── weeklyAggregator.js      (rank + per-student weekly summary)
│   ├── weeklyRecap.js           (finalize + AI plan + goal derivation)
│   ├── weeklyRecapScheduler.js  (idempotent in-process 5-min tick)
│   ├── spTrend.js               (trend + heatmap + summary)
│   └── levels.js                (16-rank system, replaces old Bronze→Legend)
├── routes/
│   ├── weekly.js                (/api/weekly/desktop)
│   ├── recap.js                 (/api/weekly/recap)
│   └── spTrend.js               (/api/weekly/sp-trend)
├── models/
│   └── WeeklyRecap.js
└── server.js                    (mounts all /api/weekly/* routes)
```

---

## Client File Map (new)

```
client/src/components/
├── weekly-leaderboard/
│   ├── WeeklyLeaderboardDesktop.tsx + .css   (page shell + state machine)
│   ├── WeeklyLeaderboard.tsx                 (scrollable rank table)
│   ├── RightRail.tsx                         (6 right-column widgets)
│   ├── Top10Popup.tsx                        (full-width celebration)
│   ├── RegularUserCard.tsx                   (4 metric tiles + CTA)
│   └── FreshWeekEmpty.tsx                    ("A New Weekly Challenge Has Begun!")
├── weekly-recap/
│   ├── WeeklyChampionsPopup.tsx              (full-mode Stages 1)
│   ├── AIRecoveryCoachPopup.tsx              (full-mode Coach)
│   ├── WeeklyLearningInsightsPopup.jsx + .css (inline-mode flip card)
│   ├── RecoveryCoachPopup.jsx + .css         (inline-mode Coach)
│   └── SPTrendPanel.jsx + .css               (trend + heatmap)
├── rank-system/
│   ├── ranks.js                              (16-rank table)
│   ├── RankJourney.jsx                       (hero badge + track)
│   └── rank-system.css
└── main.jsx                                  (mounts RankJourney inline)
```

---

## Key Architectural Decisions (Part 2)

1. **No schema migrations** — `WeeklyRecap` is the only new Mongoose collection; all other features are pure aggregations over `SPTransaction` + `Student`
2. **No breaking changes** — existing `/api/leaderboard`, `/api/weekly/desktop`, `/api/weekly/recap`, `/api/weekly/sp-trend` are all additive; the old `/api/leaderboard` still works
3. **Cascade order is intentional** — Champions (aspiration) → Insights (reflection) → Coach (only for bottom-50, never for top-10). This avoids ever rubbing a struggling student's face in the top 10 list
4. **One round-trip per popup stage** — `/api/weekly/recap` returns `{ recapId, recap, plan, me, case, goal, liveProgress }` so the cascade has no waterfall
5. **localStorage per-week dismissal** — each popup is keyed on `recapId` (weekStart ISO) so it shows only once per week, even after refresh
6. **CSS-only animations everywhere** — SMIL SVG `<animateTransform>` was removed from rank system to avoid Chromium/Edge crashes; all keyframe animations honor `prefers-reduced-motion`
7. **Inline + full-page modes** — `WeeklyLeaderboardDesktop` accepts an `inline` prop so the same component renders inside the Spurti dashboard OR as a full-page standalone view

---

## Performance (Part 2)

- Build: **769 modules**, **81 KB CSS**, **942 KB JS** (gzip 14 KB / 283 KB)
- Premium cascade adds ~12 KB gzipped to the bundle
- 16-rank system is pure CSS — no JS animation overhead
- SPTrendPanel uses inline SVG — no Chart.js dependency
- Confetti / sparkles are pure CSS keyframes + framer-motion

---

## What was NOT changed (Part 2)

- ❌ No schema migrations on `students`, `sptransactions`, `attendance`, `polls`, `chats`
- ❌ No pipeline scoring changes (still uses `pipeline/sp-rubric-build-mirror.cjs`)
- ❌ No SP calculation changes
- ❌ No auth changes (still uses `chatengine_token` cookie passthrough)
- ❌ No font family / typography hierarchy changes
- ❌ No icon library added (emojis preserved)
- ❌ No Tailwind / styled-components added (vanilla CSS + framer-motion)
- ❌ No scheduled jobs / cron — `weeklyRecapScheduler` is in-process and idempotent

---

## Final Summary

**22 distinct features** across the original 17 + the weekly leaderboard build. The Spurti dashboard now offers a **professional Monday-morning recap experience** — Champions popup → Insights popup that flips after 10s → Recovery Coach popup (bottom-50 only) — all built on top of the existing 16-rank progression system and SP Trend heatmap. The dashboard scale goes from "student tracker" to "premium engagement SaaS" while preserving the existing MongoDB schema, SP calculation pipeline, and auth flow exactly as they were.