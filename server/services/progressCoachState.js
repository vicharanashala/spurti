// Adapter from the existing My Journey state to the pure Progress Coach rules.
// This module owns data-shape translation only; status and recommendation rules
// stay in progressCoach.js so they can be tested without MongoDB.

import { buildJourneyState, STANDUP_MIN_PER_DAY } from './journey.js';
import { buildProgressCoach } from './progressCoach.js';

function hasGoal(goal) {
  return Boolean(goal?.hasTarget || goal?.status === 'active' || goal?.status === 'missed');
}

function snapshot(plan, key, remainingField) {
  const row = plan?.atSet?.[key];
  if (!row) return {};
  return {
    remainingAtSet: typeof row[remainingField] === 'number' ? row[remainingField] : null,
    targetStartedAt: row.at || null
  };
}

function buildTracks(journey) {
  const { goals, plan, standups, vibe, spa, projects } = journey;

  const standupHasActivity = standups.sessionsAttended > 0 || standups.pollsTotal > 0;
  const vibeHasActivity = vibe.ladder.some((course) => course.pct > 0 || course.prior);
  const spaHasActivity = spa.solved > 0 || spa.taught > 0;
  const projectHasActivity = projects.submitted || Boolean(projects.reviewStatus);

  return [
    {
      key: 'standup',
      name: 'Standup attendance',
      goal: goals.standup,
      unitLabel: 'minutes',
      completionUnit: STANDUP_MIN_PER_DAY,
      capacity: { value: STANDUP_MIN_PER_DAY, unit: 'working day' },
      hasActivity: standupHasActivity,
      ...snapshot(plan, 'standup', 'remainingMin'),
      // No upcoming-session service is available in My Journey yet, so an
      // entirely new student gets a neutral state instead of a made-up CTA.
      normalAction: standupHasActivity || hasGoal(goals.standup)
        ? { title: 'Keep attending standups' }
        : null
    },
    {
      key: 'vibe',
      name: vibe.current?.name || 'ViBe courses',
      goal: goals.vibe,
      unitLabel: '%',
      hasActivity: vibeHasActivity,
      weekly: vibe.weeklyFloor ? {
        met: vibe.weeklyFloor.met,
        // The current ViBe state exposes whether the floor is met, but not a
        // week-progress deadline. Do not call an unmet floor "behind" before
        // an existing weekly semantic says that it is behind.
        behind: false
      } : null,
      ...snapshot(plan, 'vibe', 'remainingPct'),
      normalAction: vibeHasActivity || hasGoal(goals.vibe)
        ? { title: vibe.current ? `Continue ${vibe.current.name}` : 'Continue ViBe courses' }
        : null
    },
    {
      key: 'spa',
      name: 'SPA practice',
      goal: goals.spa,
      unitLabel: 'problems',
      completionUnit: 1,
      hasActivity: spaHasActivity,
      ...snapshot(plan, 'spa', 'remainingCount'),
      normalAction: spaHasActivity || hasGoal(goals.spa)
        ? { title: 'Solve the next SPA problem' }
        : null
    },
    {
      key: 'project',
      name: 'Project work',
      goal: goals.project,
      unitLabel: 'PR',
      completionUnit: 1,
      hasActivity: projectHasActivity,
      ...snapshot(plan, 'project', 'prsRaised'),
      // JourneyPlan stores the number of PRs at goal creation, whereas the
      // coach compares remaining work. Convert the existing snapshot here.
      remainingAtSet: typeof plan?.atSet?.project?.prsRaised === 'number'
        ? Math.max(0, 1 - plan.atSet.project.prsRaised)
        : null,
      normalAction: projectHasActivity || hasGoal(goals.project)
        ? { title: 'Continue your project work' }
        : null
    }
  ];
}

export async function buildProgressCoachState(student, options = {}) {
  const journey = await buildJourneyState(student);
  if (!journey.eligible) return { eligible: false };

  const tracks = buildTracks(journey);
  const hasActivity = tracks.some((track) => track.hasActivity);
  return {
    eligible: true,
    ...buildProgressCoach({ tracks, hasActivity }, options)
  };
}

export { buildTracks };
