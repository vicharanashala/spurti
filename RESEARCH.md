# RESEARCH.md - Pedagogical & Educational Research Mapping

## Table of Contents
1. [Theoretical Framework](#1-theoretical-framework)
2. [Self-Regulated Learning (SRL) Mapping](#2-self-regulated-learning-srl-mapping)
3. [Self-Determination Theory (SDT) Alignment](#3-self-determination-theory-sdt-alignment)
4. [Pedagogical Mapping of Core Features](#4-pedagogical-mapping-of-core-features)
5. [Ethical Considerations in Gamified Systems](#5-ethical-considerations-in-gamified-systems)

---

## 1. Theoretical Framework

Spurti is built on established educational theories rather than arbitrary gamification. It is designed to foster intrinsic motivation, self-monitoring, and resilience in learners. 

The system's mechanics are primarily mapped to two major educational psychology frameworks:
- **Self-Regulated Learning (SRL)** (Zimmerman, 2000; Pintrich, 2000)
- **Self-Determination Theory (SDT)** (Deci & Ryan, 1985; Ryan & Deci, 2000)

---

## 2. Self-Regulated Learning (SRL) Mapping

Self-Regulated Learning is the process by which learners systematically direct their thoughts, feelings, and actions toward attaining their learning goals. Zimmerman outlines three cyclical phases of SRL:

```
                  ┌────────────────────────────────────────┐
                  │          1. FORETHOUGHT PHASE          │
                  │  - Goal Setting (Target SP Goals)      │
                  │  - Strategic Planning (What to do next)│
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │        2. PERFORMANCE CONTROL          │
                  │  - Self-Recording (Poll tracking)      │
                  │  - Task Strategies (Attendance bounds) │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │         3. SELF-REFLECTION             │
                  │  - Self-Evaluation (Trophy Leagues)    │
                  │  - Adaptive Decisions (Recovery Plans)  │
                  └────────────────────────────────────────┘
```

Spurti directly supports these phases:
1. **Forethought Phase**: The dashboard's "What to do next" action list encourages students to set small goals (e.g. "Attend 3 sessions to recover +15 SP").
2. **Performance Control**: Real-time feedback from poll attempts and attendance trackers helps students monitor their attention during live sessions.
3. **Self-Reflection Phase**: The dynamic Trophy League and historical Sparkline graph help students evaluate their consistency over time and make plans to improve.

---

## 3. Self-Determination Theory (SDT) Alignment

Self-Determination Theory suggests that human behavior is driven by three basic psychological needs. When these needs are met, students show higher engagement and persistence:

```
                   ┌──────────────────────────────────────┐
                   │        BASIC PSYCHOLOGICAL NEEDS     │
                   └──────────────────┬───────────────────┘
                                      │
      ┌───────────────────────────────┼───────────────────────────────┐
      ▼                               ▼                               ▼
┌───────────┐                   ┌───────────┐                   ┌───────────┐
│ AUTONOMY  │                   │ COMPETENCE│                   │RELATEDNESS│
└─────┬─────┘                   └─────┬─────┘                   └─────┬─────┘
      │                               │                               │
      ▼                               ▼                               ▼
Recovery Missions                Level System                  Onboarding Group
Select recovery tasks            Lifetime Level never          Compare with cohorts
freely without shame             decreases (protects effort)   sharing start dates
```

1. **Autonomy**: Recovery Missions give students choices in how they bounce back from low points, without feeling punished.
2. **Competence**: Separating permanent Levels from dynamic Trophy Leagues protects a student's sense of competence. A drop in current SP may lower their league, but their lifetime Level remains intact, acknowledging their past effort.
3. **Relatedness**: Grouping students by their onboarding cohort (Onboarding Groups) provides a fair, relevant peer comparison group, building a supportive community.

---

## 4. Pedagogical Mapping of Core Features

| Feature | Educational Mechanism | Research Rationale | Pedagogical Goal |
|---|---|---|---|
| **SP Ledger** | Self-Recording & Auditability | Visible progress logs reduce cognitive load and help students understand exactly how their actions affect their standing. | Build metacognitive awareness of learning habits. |
| **Banded Rewards (10/5/3/0)** | Positive Reinforcement | Sharp pass/fail cutoffs can demotivate students who fall just short. Banded tiers reward incremental effort. | Encourage effort even when 100% completion is missed. |
| **Recovery Missions** | Resilience & Growth Mindset | Traditional grading systems make recovery difficult. Providing clear recovery paths helps students view mistakes as opportunities to learn. | Reduce dropouts by providing actionable ways to restart. |
| **Trophy Leagues** | Temporal Comparison | Dynamic leagues help students focus on their recent effort rather than comparing themselves to unattainable top ranks. | Support healthy self-evaluation. |
| **Survey Webhook Popup** | Mandatory Reflection | Blocking popup modals require students to complete weekly check-ins, reinforcing self-regulated habits. | Gather qualitative feedback and encourage self-reflection. |

---

## 5. Ethical Considerations in Gamified Systems

- **Avoiding Hyper-Competition**: Spurti does not feature a prominent, program-wide leaderboard on the main student view. Peer rankings are placed under a secondary tab, and the primary focus remains on the student's personal metrics (Level, League, Trend Sparkline, Action Nudges) to encourage self-comparison rather than intense competition.
- **Supportive Framing**: Points are referred to as "Learning Energy" or "Engagement Credits" rather than scores, positioning Spurti as a supportive motivation tool rather than a grading system.
- **Privacy Controls**: Wildcard student searches mask emails (e.g. `la****an@example.com`) and hide details until identity is confirmed, preventing public comparisons.
- **No-Shame Architecture**: Excused students are quietly filtered from leaderboards and rankings. This protects their records and prevents public embarrassment during leaves.
