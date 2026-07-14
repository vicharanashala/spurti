# SCORING.md - Spurti Points & Progress Scoring System

## Table of Contents
1. [Introduction](#1-introduction)
2. [Mathematical Formulations](#2-mathematical-formulations)
   - [2.1 Total SP Calculation](#21-total-sp-calculation)
   - [2.2 Session Ingestion Eligibility Window](#22-session-ingestion-eligibility-window)
   - [2.3 Attendance Scoring ($S_A$)](#23-attendance-scoring-s_a)
   - [2.4 Poll Participation Scoring ($S_P$)](#24-poll-participation-scoring-s_p)
3. [Derived Progression Mechanics](#3-derived-progression-mechanics)
   - [3.1 Lifetime Motivation Levels](#31-lifetime-motivation-levels)
   - [3.2 Dynamic Trophy Leagues](#32-dynamic-trophy-leagues)
   - [3.3 Biweekly Leaderboard Groups](#33-biweekly-leaderboard-groups)
4. [Streaks, Badges, and Recovery Actions](#4-streaks-badges-and-recovery-actions)

---

## 1. Introduction

Spurti implements a rigorous, idempotent **Band/Tier scoring rubric** built in the background pipeline scripts (`sp-rubric-build-mirror.cjs` and `sp-rubric-build.js`). Points are not modified dynamically in Express controllers; instead, the background scheduler re-compiles the entire transaction ledger based on raw logs to maintain database consistency and clear duplicate data.

---

## 2. Mathematical Formulations

### 2.1 Total SP Calculation

Let $SP_{total}$ be the total Spurti Points of a student. Let $T_0$ represent the initial base credit. Let $T_i$ represent a transaction delta from a set of sessions $S$ where the session date $\ge$ the student's official onboarding start date:

$$SP_{total} = SP_{initial} + \sum_{s \in S} \left( S_A(s) + S_P(s) \right) + \sum M_{discretionary}$$

Where:
- $SP_{initial} = 100$ (Credited on the official start date).
- $S_A(s)$ is the attendance score for session $s$.
- $S_P(s)$ is the poll score for session $s$.
- $M_{discretionary}$ represents manually approved additions or deductions (e.g. Chat SP reviews).
- If the current date is before the student's official start date, $SP_{total} = 0$.

---

### 2.2 Session Ingestion Eligibility Window

For any given day, a session is considered eligible for mandatory SP scoring if:
$$\text{Participants Count} \ge 10$$
$$\text{Topic matches } \text{/stand|orientation/i} \quad \text{AND} \quad \text{Topic does not match } \text{/breakout|weekend|nptel|special|support/i}$$

The official tracking window duration ($W$) is defined between a strict start time ($t_{start} = \text{09:05 IST}$) and a dynamic end time ($t_{end}$):
$$t_{end} = \min(\text{first-instance-end}, \text{11:00 IST})$$
$$W = t_{end} - t_{start} \quad \text{(in minutes)}$$

---

### 2.3 Attendance Scoring ($S_A$)

A student's presence interval is clipped strictly to the official window:
$$t_{clipped} = \sum_{j} \max\left(0, \min(t_{leave, j}, t_{end}) - \max(t_{join, j}, t_{start})\right)$$

The attendance percentage ($P_A$) is:
$$P_A = \left( \frac{t_{clipped}}{W} \right) \times 100$$

The attendance score ($S_A$) awarded per session follows the banded step function:

$$S_A(P_A) = \begin{cases} 
      10 & \text{if } P_A \ge 90\% \\
      5 & \text{if } 75\% \le P_A < 90\% \\
      3 & \text{if } 50\% \le P_A < 75\% \\
      0 & \text{if } P_A < 50\% 
   \end{cases}$$

> [!NOTE]
> There are no negative score penalties for low attendance in the current band rubric. The minimum score added is $0$.

---

### 2.4 Poll Participation Scoring ($S_P$)

The poll attempt percentage ($P_P$) evaluates engagement:
$$P_P = \left( \frac{\text{Questions Attempted}}{\text{Total Questions Launched}} \right) \times 100$$

The poll score ($S_P$) awarded per session is:

$$S_P(P_P) = \begin{cases} 
      10 & \text{if } P_P \ge 90\% \\
      5 & \text{if } 75\% \le P_P < 90\% \\
      3 & \text{if } 50\% \le P_P < 75\% \\
      0 & \text{if } P_P < 50\% 
   \end{cases}$$

---

## 3. Derived Progression Mechanics

These progress metrics are modeled as pure functions over stored SP balances:

### 3.1 Lifetime Motivation Levels
Levels are a permanent indicator of effort and never decrease, even if a student loses SP due to manually approved deductions:
$$\text{Level} = \left\lfloor \frac{\max(highestSpEver, totalSp)}{100} \right\rfloor$$

---

### 3.2 Dynamic Trophy Leagues
Leagues reflect current consistency. The bands are defined in `server/services/levels.js`:

| League Name | Lower Bound (SP) | Upper Bound (SP) |
|---|---|---|
| **Legend** | 1500 | $\infty$ |
| **Diamond I / II / III** | 1400 / 1300 / 1200 | 1499 / 1399 / 1299 |
| **Platinum I / II / III** | 1100 / 1000 / 900 | 1199 / 1099 / 999 |
| **Gold I / II / III** | 800 / 700 / 600 | 899 / 799 / 699 |
| **Silver I / II / III** | 500 / 400 / 300 | 599 / 499 / 399 |
| **Bronze I / II / III** | 200 / 100 / 0 | 299 / 199 / 99 |

---

### 3.3 Biweekly Leaderboard Groups
Students are grouped into comparison cohorts based on their onboarding date to ensure peer leaderboards remain fair and relevant.
- Onboarding day 1 to 15: `YYYY-MM-01_to_YYYY-MM-15`
- Onboarding day 16 to end of month: `YYYY-MM-16_to_YYYY-MM-lastDay`

---

## 4. Streaks, Badges, and Recovery Actions

- **Streak Verification**: The client script evaluates the transaction history to identify consecutive sessions where $S_A(P_A) = 10$. If student status changes to `excused`, the streak value is locked (frozen) until the student returns to `active` status.
- **Badge Calculation**: Pure client-side calculations:
  - `Consistent Attendee`: Count of transactions with $category = 'attendance'$ and $appliedDelta \ge 5$ divided by total attendance transactions $\ge 0.75$.
  - `Above Average`: Checks if student's `totalSp` is greater than or equal to the average SP calculated on `/api/me` load.
- **Recovery Mission Trigger**: If `totalSp < 100` (onboarding base baseline), the student enters a "debit state." Normal dashboard features are locked behind a mandatory survey response popup. Completing this survey restores a buffer and reactivates dashboard metrics.
