# PRODUCT.md - Spurti Product Specification

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Motivation](#2-problem-statement--motivation)
3. [Product Vision & Core Concept](#3-product-vision--core-concept)
4. [User Personas](#4-user-personas)
5. [Core Product Systems](#5-core-product-systems)
   - [5.1 Motivation Levels & Leagues](#51-motivation-levels--leagues)
   - [5.2 Badge System](#52-badge-system)
   - [5.3 Streak System](#53-streak-system)
   - [5.4 Recovery Missions](#54-recovery-missions)
6. [Dashboard Specifications](#6-dashboard-specifications)
7. [Success Metrics (KPIs)](#7-success-metrics-kpis)
8. [Example User Journeys](#8-example-user-journeys)

---

## 1. Executive Summary

**Spurti** is an open-source, production-ready Student Self-Motivation and Engagement Engine designed to address the problem of student disengagement and silent dropouts in large-scale learning programs. Operating as a motivation layer on top of educational activities (such as live lectures, quizzes, and discussion forums), Spurti tracks student participation in real-time, converting effort and consistency into visible motivation signals: Spurti Points (SP), levels, leagues, streaks, badges, and recovery goals. 

Rather than serving as an academic grading system, Spurti acts as a gamified self-regulation mirror. It empowers students to monitor their consistency, assists teachers and mentors in identifying disengaged students early, and helps program administrators evaluate engagement health across large cohorts.

---

## 2. Problem Statement & Motivation

Many students start a course, internship, or online program with high enthusiasm but lose consistency over time. In large cohorts (hundreds or thousands of learners), tracking individual engagement becomes difficult. 

The traditional signals (grades, assignment scores, and attendance reports) present several core problems:
- **Lagging Indicator**: Students find out they have failed only after an exam, assignment deadline, or program completion.
- **Punitive Focus**: Existing systems highlight failure rather than promoting consistency and recovery.
- **Educator Blind Spots**: Teachers and mentors cannot easily identify which students are active, slowing down, or at risk of dropping out until it is too late.

Spurti solves these problems by providing continuous, positive, explainable, and real-time engagement signals.

---

## 3. Product Vision & Core Concept

The vision of Spurti is to cultivate **self-regulated learning habits** and make learning effort visible. It treats a student's engagement like an energy balance. The core concept comprises four connected loops:

```
┌─────────────────────────────────────────────────────────┐
│                        AWARENESS                        │
│             "Where do I stand in my journey?"           │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│                         ACTION                          │
│             "What small step do I take next?"           │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│                        FEEDBACK                         │
│             "SP, levels, leagues, and badges"           │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│                        RECOVERY                         │
│             "How do I restart after falling behind?"    │
└─────────────────────────────────────────────────────────┘
```

---

## 4. User Personas

1. **The Student**: Needs to stay aware of their progress, stay motivated, self-monitor their habits, and find paths to recover from low-engagement periods.
2. **The Teacher/Instructor**: Needs to see cohort-wide engagement statistics, understand lesson effectiveness, and identify at-risk students.
3. **The Mentor/Facilitator**: Needs granular analytics on their assigned group to run targeted, positive check-ins.
4. **The Program Administrator**: Needs aggregate logs, database health diagnostics, and audit capabilities to ensure the integrity of the tracking pipeline.

---

## 5. Core Product Systems

### 5.1 Motivation Levels & Leagues

Spurti utilizes a dual-progression loop that separates **permanent effort (Level)** from **current consistency (Trophy League)**:

#### Lifetime Motivation Levels (Permanent)
- **Concept**: Represents cumulative, lifetime effort. Once unlocked, a level cannot be lost.
- **Formula**: `Level = floor(highestSpEver / 100)`
- **Behavior**: Encourages long-term persistence and rewards past achievements, preventing the discouragement that occurs when points drop.

#### Trophy Leagues (Dynamic)
- **Concept**: Reflects recent participation consistency. It can increase or decrease based on current SP balance.
- **Bands**:
  | SP Range | Trophy League |
  |---|---|
  | `1500+` | Legend (Unlocks permanent Legend Badge) |
  | `1400 - 1499` | Diamond I |
  | `1300 - 1399` | Diamond II |
  | `1200 - 1299` | Diamond III |
  | `1100 - 1199` | Platinum I |
  | `1000 - 1099` | Platinum II |
  | `900 - 999` | Platinum III |
  | `800 - 899` | Gold I |
  | `700 - 799` | Gold II |
  | `600 - 699` | Gold III |
  | `500 - 599` | Silver I |
  | `400 - 499` | Silver II |
  | `300 - 399` | Silver III |
  | `200 - 299` | Bronze I |
  | `100 - 199` | Bronze II |
  | `0 - 99` | Bronze III |

---

### 5.2 Badge System

Badges recognize qualitative milestones, behavioral shifts, and peer contributions:

| Badge Type | Badge Name | Criteria | Behavioral Target |
|---|---|---|---|
| **Progression** | `Getting Started` | Onboarding completed (Base 100 SP credited) | Onboarding engagement |
| **Performance** | `Top 50` | Rank is $\le 50$ on the Leaderboard | High-level consistency |
| **Consistency** | `Consistent Attendee` | Attended $\ge 75\%$ of all active sessions | Session attendance habits |
| **Engagement** | `Poll Champion` | Attempted $\ge 75\%$ of total poll questions | Active session listening |
| **Cohort Standing** | `Above Average` | Current SP $\ge$ Cohort Average SP | Comparison metrics |
| **Ultimate Achievement** | `Legend` | Lifetime SP ($highestSpEver$) reaches $\ge 1500$ | Long-term mastery |

---

### 5.3 Streak System

Streaks reward consecutive, daily actions to build automatic habits:
- **Attendance Streak**: Number of consecutive mandatory sessions attended where attendance percentage $\ge 90\%$.
- **Poll Streak**: Number of consecutive sessions with 100% poll attempt rates.
- **Habit Streaks**: Unlocked in the UI to visualize consecutive days of logging into the dashboard or completing reflection prompts.
- **Streak Protection**: Excused sessions (marked with student status `excused` or specific excused flags) do not break active streaks; they are treated as "frozen."

---

### 5.4 Recovery Missions

To counteract the "demotivation effect" of a drop in points, Spurti introduces **Recovery Missions**:
- **Triggers**: Triggered when a student falls below `100 SP` (the onboarding baseline) or incurs multiple consecutive attendance/poll debits.
- **Mission Mechanics**:
  - *Attendance Streak Mission*: Attend 3 consecutive sessions at $\ge 90\%$ clipping to earn a $+15$ SP recovery bonus.
  - *Poll Recovery Mission*: Complete 100% of polls for 3 consecutive sessions to retrieve $+15$ SP.
  - *Reflection & Feedback Mission*: Complete the mandatory weekly survey popup to restore a small buffer (+5 SP) and unlock the dashboard.

---

### 5.5 Weekly Self-Regulation Goal & Reflection Planner

To reinforce positive learning habits, Spurti integrates an interactive **Weekly Self-Regulation Goal Planner** on the student dashboard:
- **Mechanics**:
  - *Commitment Setting*: Students set a target Trophy League (e.g. `Gold I`) and designate a focus area (`Attendance & Polls`, `Attendance Only`, `Polls Only`, `None`).
  - *Strategy Reflection*: Students write a short strategy detailing *how* they plan to achieve this goal (e.g., "I will join 5 minutes early to avoid missing the start of meetings").
  - *Real-time Progress Tracker*: Queries the student's transaction log for the active calendar week and displays a progress fill bar representing completed vs. qualified sessions.
- **Pedagogical Impact**: Directly implements Pintrich and Zimmerman's SRL cycles of Goal Setting, Strategic Planning, and Self-Monitoring.

---

## 6. Dashboard Specifications

- **Student Dashboard**: Focuses on self-monitoring. Shows current SP balance, rank, standing relative to comparison cohorts (Onboarding Group), permanent Level, Trophy League, sparkline of SP trends over time, and explicit "What to do next" action nudges.
- **Teacher Dashboard (Admin View)**: Focuses on cohort health. Displays active viewers, statistical aggregates (Average, Median, Min, Max), student-by-status lists, a grid of attendance metrics, and "Admin Alerts" identifying students who are slowing down, have low SP, or are inactive.

---

## 7. Success Metrics (KPIs)

To evaluate the impact of the motivation engine, program coordinators track:

1. **Engagement Rate**: Daily Active Users (DAU) over Weekly Active Users (WAU) on the dashboard.
2. **Attendance Quality**: Percentage of students achieving $\ge 90\%$ session presence.
3. **Poll Participation**: Cohort-wide poll attempt rate (average attempted vs. launched questions).
4. **Recovery Success**: Percentage of students entering a "debit/low-SP state" who successfully return to active bands via recovery actions.
5. **Roster Completion**: Percentage of active students maintaining onboarding status vs. excused/dropout status.

---

## 8. Example User Journeys

### Student Journey: Rebounding after missing sessions
- **Scenario**: Lakshya misses three morning standup sessions due to illness.
- **Actions**:
  1. Lakshya logs in via the Samagama dashboard link and opens Spurti.
  2. A popup informs him that he is excused for the illness period (streak frozen), but his overall SP has dropped due to preceding absences.
  3. He sees a "Recovery Mission" option on his dashboard: "Complete 100% polls in the next 3 sessions to recover +15 SP."
  4. He joins the next session, answers all polls, completes the mission, and sees his SP return to the Gold league.

### Teacher Journey: High-level intervention
- **Scenario**: An instructor, Sudarshan, wants to check if the class found the recent topics confusing.
- **Actions**:
  1. Sudarshan logs into the Spurti Control Room.
  2. He opens the **Analytics** tab and looks at the **Attendance by Session** table.
  3. He notices that on Day 12, attendance dropped by 15%, and the average minutes attended fell to 45 mins.
  4. He clicks on "Admin Alerts" and extracts the list of students with "Below 100 SP."
  5. He pushes a notification and schedules a review session for this specific cohort.
