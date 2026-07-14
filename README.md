
# Student Self-Motivation Engine

> **Public repository — sensitive data removed 2026-07-14**
>
> This is the public mirror of the Spurti / Student Self-Motivation Engine.
> Real student data (rosters, SP ledger CSVs, attendance reports, SP
> balance PDFs, excused-student emails, seed manifests, all exports) used
> to live under `data/`. Those files have been replaced with placeholders
> on the `main` branch. The repository contains no personally-identifying
> information at HEAD. If you cloned before 2026-07-14, your local clone
> and the git history still contain those files — see `data/example/README.md`
> for details and shape references.
>
> All schema, services, scripts, configuration samples (`.env.example`,
> `.env.ssh.example`), and code are present and runnable.

## Problem Statement

Many students begin a course, subject, internship, certification, or learning program with interest, but lose consistency over time. This is especially common in large-scale learning environments where hundreds or thousands of learners are enrolled at once. Students may miss sessions, delay tasks, avoid practice, stop reflecting on progress, or slowly disconnect from the learning process.

Most education systems show students marks, grades, attendance, or final completion status. These signals are useful, but they often come too late. A learner may know they have failed only after the exam, assignment deadline, or program end. In large classes, teachers and mentors may also notice disengagement only after the student has already lost momentum.

The deeper problem is not only lack of information. It is lack of continuous motivation, self-monitoring, and recovery support. Students need a simple way to see their learning energy, understand their consistency, feel encouraged to keep going, and recover when they fall behind.

This direction addresses the problem by creating a general motivation engine for self-regulated learning. It converts learning effort, participation, progress, reflection, and consistency into visible motivation signals such as points, progress bands, streaks, badges, nudges, and recovery goals. The purpose is not to punish students or replace academic grading. The purpose is to help students stay aware, motivated, and moving toward completion.

## Concept Description

The proposed system is a student self-motivation and engagement engine for any structured learning journey. It can be used in a school subject, college course, online course, internship, bootcamp, training program, certification, workshop, or large-scale learning platform.

The system gives students a visible measure of their learning momentum. This measure may be called learning energy, motivation points, engagement credits, progress points, or any locally suitable name. Students earn these signals through consistent learning behavior such as attending sessions, completing tasks, attempting quizzes, submitting reflections, participating in discussions, reaching milestones, revising regularly, or helping peers.

The approach is based on the idea of self-regulated learning. Students should be able to set goals, monitor their progress, recognize when they are falling behind, take corrective action, and reflect on improvement. The system supports this by giving continuous feedback in a student-friendly format.

For large learning environments, the framework also helps teachers, mentors, or program teams understand which students are active, which students are slowing down, and which students may need support. The focus is not surveillance. The focus is early encouragement and timely intervention.

## Educational Motivation Model

The motivation model encourages students through four connected loops:

- Awareness: Students see where they stand in the learning journey.
- Action: Students are encouraged to complete small learning actions regularly.
- Feedback: Students receive visible points, progress, badges, or nudges after meaningful effort.
- Recovery: Students who fall behind receive clear pathways to restart and continue.

This loop helps students answer important self-regulation questions:

- What is my current learning progress?
- Am I being consistent?
- What did I complete this week?
- Where did I lose momentum?
- What small action can I take next?
- How can I recover and continue?

## Core Idea

The system should work as a motivation layer on top of learning activities. It does not need to be limited to one course type or one institution. It should support any learning context where persistence, participation, and completion matter.

Examples of learning contexts include:

- A semester-long subject.
- A remote or offline course.
- A large online class.
- A professional training program.
- A school learning module.
- A college internship.
- A project-based bootcamp.
- A certification or skill-development track.

In all these contexts, the central purpose remains the same: help students keep going until they complete the learning journey.

## Reward And Motivation Design

The reward system should support healthy motivation. It should not make students feel punished for every small mistake. It should help them understand their behavior and encourage better habits.

Design principles:

- Use points as feedback, not as academic marks.
- Reward consistency, improvement, effort, and completion.
- Prefer positive and banded rewards over harsh pass-fail thresholds.
- Make progress visible in small steps.
- Keep rewards explainable and fair.
- Give students recovery paths after low engagement.
- Encourage self-monitoring and reflection.
- Avoid overemphasis on competition.
- Use leaderboards carefully, if used at all.
- Support both individual progress and community encouragement.

Possible motivational elements:

- Learning energy score or motivation points.
- Weekly progress bands such as Excellent, Active, Slowing Down, and Recovery.
- Streaks for regular practice, attendance, revision, or task completion.
- Badges for milestones, improvement, comeback, consistency, and peer support.
- Personal goals and weekly targets.
- Gentle nudges when students become inactive.
- Reflection prompts after important learning activities.
- Recovery missions for students who fall behind.
- Completion celebrations when students finish a module, subject, course, or program.

## Self-Regulated Learning Support

The system should help students develop self-regulated learning habits. This means it should support:

- Goal setting: Students know what they are trying to complete.
- Planning: Students can see upcoming learning actions or milestones.
- Self-monitoring: Students can track their own consistency and progress.
- Feedback interpretation: Students understand why their motivation score changed.
- Reflection: Students can think about what worked and what needs improvement.
- Recovery: Students can restart after missing tasks or losing momentum.

The system should make progress feel manageable. Instead of showing only a large final goal, it should break the journey into smaller motivational checkpoints.

## Large-Scale Learning Support

In large learning environments, teachers and mentors cannot personally track every student's motivation every day. The system should help by summarizing learning engagement patterns at scale.

It can help educators identify:

- Students who are consistently active.
- Students who are improving.
- Students who are becoming inactive.
- Students who need recovery support.
- Topics or weeks where many students lose momentum.
- Activities that create strong engagement.

This allows educators to respond earlier through nudges, extra support, reminders, peer groups, or redesigned activities.

## Core Users

- Students: Track progress, stay motivated, recover from low engagement, and complete the learning journey.
- Teachers or instructors: Understand class engagement and support students before they drop out.
- Mentors or facilitators: Encourage learners, guide recovery, and recognize effort.
- Program administrators: Monitor large-scale learning health and completion patterns.

## Goals

- Help students stay motivated during long learning journeys.
- Improve course, subject, internship, or program completion.
- Build self-regulated learning habits.
- Make learning effort and consistency visible.
- Reduce silent dropout in large-scale education.
- Encourage recovery instead of shame.
- Support teachers and mentors with early engagement signals.
- Create a fair and transparent motivation system.

## Success Metrics

This direction can be evaluated through:

- Course or program completion rate.
- Weekly active learner rate.
- Task or milestone completion rate.
- Improvement in student consistency over time.
- Number of students who recover after low engagement.
- Student perception of motivation and fairness.
- Student self-regulated learning indicators.
- Reduction in silent dropout.
- Teacher or mentor ability to identify at-risk students earlier.

## Positioning

This is a general educational motivation engine. It is not only for internships, and it is not only a points table. It is a self-regulated learning support system and research direction that helps students see their progress, stay encouraged, recover from setbacks, and complete any meaningful learning journey.
Displaying PRODUCT.md.
