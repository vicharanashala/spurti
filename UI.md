# UI.md - Spurti User Interface Layout & Wireframes

## Table of Contents
1. [Design Style & Color Tokens](#1-design-style--color-tokens)
2. [Student Dashboard Wireframe](#2-student-dashboard-wireframe)
3. [Teacher Dashboard Wireframe](#3-teacher-dashboard-wireframe)
4. [Weekly Analytics & Alerts Screen](#4-weekly-analytics--alerts-screen)
5. [Survey Triangulation Popup Modal](#5-survey-triangulation-popup-modal)

---

## 1. Design Style & Color Tokens

Spurti implements a modern dashboard UI using clean, vanilla CSS variables (specified in `client/src/styles.css`). The visual layout relies on responsive grid components, light container backgrounds, and vibrant gradients to map Trophy Leagues:

- **Background**: `#f6f8fb` (cool grey/blue slate)
- **Primary Color**: `#176b87` (sleek teal/ocean blue)
- **Bronze League**: Linear Gradient `#a97142` to `#cd7f32`
- **Silver League**: Linear Gradient `#9aa3ab` to `#c0c0c0`
- **Gold League**: Linear Gradient `#d4a017` to `#ffd700`
- **Platinum League**: Linear Gradient `#4aa3a3` to `#7fdbda`
- **Diamond League**: Linear Gradient `#3b82c4` to `#5fc8f0`
- **Legend League**: Linear Gradient `#6d28d9` to `#c026d3`

---

## 2. Student Dashboard Wireframe

Accessed by authenticated students at the portal root. Focuses on self-monitoring and quick feedback:

```text
+-----------------------------------------------------------------------------+
| [Back]   STUDENT SPURTI BANK: Lakshya Aran                 [ SP: 790 ]      |
|                                                     Rank 1 of 3062          |
+-----------------------------------------------------------------------------+
|                                                                             |
|  LEVEL STATUS:                                                              |
|  +----------------+ +------------------+ +---------------+ +-------------+  |
|  | Level          | | Trophy League    | | Legend Badge  | | Onboarding  |  |
|  | 7              | | Gold II          | | Locked        | | 2026-05-15  |  |
|  | lifetime accum | | current performance| (reach 1500 SP) | (cohort)    |  |
|  +----------------+ +------------------+ +---------------+ +-------------+  |
|                                                                             |
|  WEEKLY SELF-REGULATION GOAL PLANNER:                                       |
|  +-----------------------------------------------------------------------+  |
|  | Week: 2026-W27    [ Target League: Gold I ]   [ Focus: Both ]         |  |
|  | Reflection: "I will join by 09:00 IST to ensure my attendance is OK." |  |
|  | Progress:                                                             |  |
|  | - Attendance Qualified: [==================       ] 2/3 sessions      |  |
|  | - Polls Attempted:      [=========================] 3/3 sessions      |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  SPURTI PULSE (STATS):                                                      |
|  +--------------------------+ +-------------------------+ +---------------+  |
|  | Standing                 | | Cohort Comparison       | | Session Health|  |
|  | Rank 1                   | | Your SP: 790            | | Attendance:   |  |
|  | (0 points to next rank)  | | Cohort Avg: 652         | | 36/36 sessions|  |
|  |                          | | Top 50 Cutoff: 743      | | Polls:        |  |
|  |                          | | Top 10 Cutoff: 769      | | 120/120 items |  |
|  +--------------------------+ +-------------------------+ +---------------+  |
|  +-------------------------------------+ +--------------------------------+  |
|  | Badges                              | | SP Trend Sparkline             |  |
|  | [ Top 50 ]  [ Consistent Attendee ] | | |||||||||||||||||||||||||||||| |  |
|  | [ Poll Champion ]                   | | (representing balance changes) |  |
|  +-------------------------------------+ +--------------------------------+  |
|                                                                             |
|  NEXT ACTIONS NUDGES:                                                       |
|  - Earn 15 more SP to lock in the Diamond Trophy League status.             |
|  - Complete 100% of upcoming polls to protect your Poll Champion badge.     |
|                                                                             |
|  TABS:  [ SP Bank Statement ]   [ Polls List ]   [ Group Leaderboard ]      |
|  +-----------------------------------------------------------------------+  |
|  | Date & Time          | Delta  | Balance | Reason                      |  |
|  |----------------------|--------|---------|-----------------------------|  |
|  | 15 May, 11:15 IST    | +100   | 100     | Onboarding Base Credit      |  |
|  | 15 May, 11:16 IST    | +10    | 110     | Attended 100% (Day 1)       |  |
|  +-----------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------+
```

---

## 3. Teacher Dashboard Wireframe

Accessed by admin roles providing `X-Admin-Email` and `X-Admin-Token` parameters. Used for classroom check-ins:

```text
+-----------------------------------------------------------------------------+
| [Back]   ADMIN CONTROL ROOM: Spurti Control Room                            |
|          Yet to Onboard: 12  |  Active: 3062  |  Excused: 570               |
+-----------------------------------------------------------------------------+
|  TABS:  [ Leaderboard ]  [ Attendance Matrix ]  [ Live ]  [ Analytics ]     |
|                                                                             |
|  ATTENDANCE MATRIX SCREEN:                                                  |
|  Search: [                      ]   Limit: [ 50 ]   [Apply]                 |
|                                                                             |
|  +-----------------------------------------------------------------------+  |
|  | Student Name    | SP   | Day 1 (15 May) | Day 2 (16 May) | Day 3 (17 May) |  |
|  |-----------------|------|----------------|----------------|----------------|  |
|  | Lakshya Aran    | 790  | [115m/120m] OK | [110m/120m] OK | [120m/120m] OK |  |
|  | Aayush Kumar    | 650  | [40m/120m] BAD | [120m/120m] OK | [ 0m/120m] BAD |  |
|  | Rohan Verma     | 100  | [  0m/120m] BAD | [ 0m/120m] BAD | [ 0m/120m] BAD |  |
|  +-----------------------------------------------------------------------+  |
|  Note: Clicking a student row opens their transaction ledger modal.         |
+-----------------------------------------------------------------------------+
```

---

## 4. Weekly Analytics & Alerts Screen

Admin analytics view displaying cohort trends and alerting instructors to at-risk students:

```text
+-----------------------------------------------------------------------------+
|  ANALYTICS & HEARTBEATS:                                                    |
|  +---------------+ +---------------+ +---------------+ +-----------------+  |
|  | Active Now    | | Unique Today  | | Unique 7 Days | | Att. Qualified  |  |
|  | 4 students    | | 1250 users    | | 2890 users    | | 85.5% average   |  |
|  +---------------+ +---------------+ +---------------+ +-----------------+  |
|                                                                             |
|  ADMIN ALERTS (AT-RISK ACTION ITEMS):                                       |
|  +--------------------------+ +-------------------------+ +---------------+  |
|  | Below 100 SP             | | Inactive Today          | | Debits issued |  |
|  | 45 students              | | 128 students            | | 1450 cases    |  |
|  +--------------------------+ +-------------------------+ +---------------+  |
|                                                                             |
|  TOP SP DROPS THIS WEEK:                                                    |
|  +-----------------------------------------------------------------------+  |
|  | Email Address            | Debit Transaction Count | SP Lost Amount   |  |
|  |--------------------------|-------------------------|------------------|  |
|  | student.a@example.com    | 5 missed sessions       | 50 SP            |  |
|  | student.b@example.com    | 4 missed sessions       | 40 SP            |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  CHARTS:                                                                    |
|  Hourly Active Users:                         Weekly Active Users:          |
|  09:00 [============       ] 125              Week 22 [================] 285|
|  10:00 [================== ] 180              Week 23 [=============   ] 210|
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## 5. Survey Triangulation Popup Modal

A blocking modal interface configured via environment variables. Restricts student navigation when response completion flags are not met:

```text
+-----------------------------------------------------------------------------+
|  One quick step — your feedback is required                                 |
|  Please complete and submit this short survey to continue to your Spurti    |
|  dashboard. Just answer the questions and press Submit. This window closes  |
|  automatically once we receive your response.                               |
|  +-----------------------------------------------------------------------+  |
|  |                                                                       |  |
|  |                    GOOGLE FORM EMBEDDED IFRAME                        |  |
|  |                    Email: [ pre-filled from session ]                 |  |
|  |                                                                       |  |
|  |                    1. Rate session clarity: [1] [2] [3] (4) [5]       |  |
|  |                    2. What did you find difficult?                     |  |
|  |                       [                                ]              |  |
|  |                                                                       |  |
|  |                                   [Submit Form]                       |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|                                            [ I've submitted — continue ]    |
|  [!] We haven't received your response yet. Please verify that you         |
|      pressed Submit in the Google Form iframe window.                       |
+-----------------------------------------------------------------------------+
```
- **Hard Enforcement Mode**: The "Maybe later" action button is omitted from UI. Students cannot close the modal by clicking outside.
- **Soft Enforcement Mode**: A "Maybe later" button is shown, allowing the student to dismiss the survey modal temporarily.
- **Polling Loop**: Client polls `/api/survey/status` every 5 seconds. The modal closes automatically once a successful Form response is processed by the webhook.
