// Progress Coach — deterministic interpretation of existing My Journey data.
//
// This module deliberately knows nothing about MongoDB, Express, React, or SP.
// The API layer will adapt buildJourneyState() into the small track shape below,
// and the client will render the result. Keeping the rules here makes the
// recommendation predictable and unit-testable.

export const COACH_STATUS = Object.freeze({
  ON_TRACK: 'on_track',
  NEEDS_ATTENTION: 'needs_attention',
  ACTION_REQUIRED: 'action_required',
  NEUTRAL: 'neutral',
  UNAVAILABLE: 'unavailable'
});

export const ACTION_KIND = Object.freeze({
  OVERDUE: 'overdue',
  CRITICAL_DEADLINE: 'critical_deadline',
  BEHIND_PACE: 'behind_pace',
  WEEKLY_PACE: 'weekly_pace',
  ALMOST_COMPLETE: 'almost_complete',
  NORMAL: 'normal'
});

export const ACTION_PRIORITY = Object.freeze({
  [ACTION_KIND.OVERDUE]: 500,
  [ACTION_KIND.CRITICAL_DEADLINE]: 400,
  [ACTION_KIND.BEHIND_PACE]: 300,
  [ACTION_KIND.WEEKLY_PACE]: 200,
  [ACTION_KIND.ALMOST_COMPLETE]: 100,
  [ACTION_KIND.NORMAL]: 10
});

const NEEDS_ATTENTION_KINDS = new Set([
  ACTION_KIND.BEHIND_PACE,
  ACTION_KIND.WEEKLY_PACE
]);

const EPSILON = 1e-9;

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateMs(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value == null || value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Calculate the deterministic catch-up amount for a goal.
 *
 * A deadline that has arrived has no positive number of days left, so the
 * caller gets null and can describe the item as overdue instead.
 */
export function calculateCatchUp({ remaining, daysLeft, existingPerDay = null }) {
  const work = numberOrNull(remaining);
  const days = numberOrNull(daysLeft);
  if (work == null || work <= 0 || days == null || days <= 0) return null;
  if (numberOrNull(existingPerDay) != null && existingPerDay > 0) return Math.ceil(existingPerDay);
  return Math.ceil(work / days);
}

/**
 * Estimate how much of the work should remain today if progress follows a
 * straight line from the moment a target was set to its target date.
 *
 * This uses JourneyPlan.atSet, which already snapshots remaining work when a
 * target is created. If that baseline is absent or malformed, the safe result
 * is null rather than a guessed pace.
 */
export function expectedRemainingAt({ remainingAtSet, startedAt, targetDate, now = new Date() }) {
  const startRemaining = numberOrNull(remainingAtSet);
  const startMs = dateMs(startedAt);
  const targetMs = dateMs(targetDate);
  const nowMs = dateMs(now);
  if (startRemaining == null || startRemaining <= 0
      || startMs == null || targetMs == null || nowMs == null
      || targetMs <= startMs) return null;

  const elapsed = Math.min(Math.max(nowMs - startMs, 0), targetMs - startMs);
  const fractionElapsed = elapsed / (targetMs - startMs);
  return Math.max(0, startRemaining * (1 - fractionElapsed));
}

/**
 * Compare actual remaining work with the target's expected remaining work.
 */
export function paceSignal({
  remaining,
  remainingAtSet,
  startedAt,
  targetDate,
  now = new Date()
}) {
  const actual = numberOrNull(remaining);
  const expected = expectedRemainingAt({ remainingAtSet, startedAt, targetDate, now });
  if (actual == null || expected == null) {
    return { available: false, behind: false, actualRemaining: actual, expectedRemaining: null };
  }
  return {
    available: true,
    behind: actual > expected + EPSILON,
    actualRemaining: actual,
    expectedRemaining: expected
  };
}

function goalComplete(track, goal) {
  if (track.complete === true) return true;
  if (goal.status === 'achieved') return true;
  return numberOrNull(goal.remaining) === 0 && numberOrNull(goal.target) != null;
}

function actionOverride(track, kind) {
  const actions = track.actions || {};
  if (kind === ACTION_KIND.NORMAL && track.normalAction) return track.normalAction;
  return actions[kind] || {};
}

function actionFor(track, kind, { catchUp = null, pace = null } = {}) {
  const override = actionOverride(track, kind);
  const goal = track.goal || {};
  const remaining = numberOrNull(goal.remaining);
  const unit = track.unitLabel || goal.unit || 'units';
  const perDay = catchUp == null ? null : `${catchUp} ${unit}/${goal.perDayUnit || 'day'}`;

  return {
    key: `${track.key}:${kind}`,
    trackKey: track.key,
    kind,
    priority: ACTION_PRIORITY[kind],
    title: override.title || track.name || track.key,
    detail: override.detail || null,
    cta: override.cta || null,
    remaining,
    unit,
    catchUpPerDay: perDay,
    expectedRemaining: pace?.expectedRemaining ?? null
  };
}

function classifyTrack(track, now) {
  const goal = track.goal || {};
  const dataState = track.dataState || (track.available === false ? 'unavailable' : 'available');
  const applicable = track.applicable !== false;

  if (!applicable) return { track, kind: 'inactive', candidate: null, complete: true };
  if (dataState === 'unavailable') {
    return { track, kind: 'unavailable', candidate: null, complete: false };
  }

  const remaining = numberOrNull(goal.remaining);
  // Unknown remaining work is not evidence of failure. The adapter can still
  // provide a normal first action, but deadline/pace rules require a known
  // positive remainder before they are allowed to fire.
  const hasWork = remaining != null && remaining > 0;
  const complete = goalComplete(track, goal);
  const catchUp = calculateCatchUp({
    remaining,
    daysLeft: goal.daysLeft,
    existingPerDay: goal.perDay
  });
  const pace = paceSignal({
    remaining,
    remainingAtSet: track.remainingAtSet,
    startedAt: track.targetStartedAt,
    targetDate: goal.targetDate,
    now
  });

  const overdue = hasWork && (goal.status === 'missed' || (numberOrNull(goal.daysLeft) ?? 0) < 0);
  const deadlineToday = hasWork && goal.status === 'active' && goal.daysLeft === 0;
  const capacity = track.capacity;
  const exceedsCapacity = hasWork
    && capacity
    && numberOrNull(goal.perDay) != null
    && goal.perDayUnit === capacity.unit
    && goal.perDay > capacity.value;
  const behind = hasWork && (track.behind === true || pace.behind);
  const weeklyBehind = hasWork && track.weekly?.behind === true;
  const almostComplete = hasWork && (
    track.almostComplete === true
    || (numberOrNull(track.completionUnit) != null
      && remaining != null
      && remaining > 0
      && remaining <= track.completionUnit)
  );

  let kind = null;
  if (overdue) kind = ACTION_KIND.OVERDUE;
  else if (deadlineToday || exceedsCapacity) kind = ACTION_KIND.CRITICAL_DEADLINE;
  else if (behind) kind = ACTION_KIND.BEHIND_PACE;
  else if (weeklyBehind) kind = ACTION_KIND.WEEKLY_PACE;
  else if (almostComplete) kind = ACTION_KIND.ALMOST_COMPLETE;
  else if (!complete && (track.normalAction || actionOverride(track, ACTION_KIND.NORMAL).title)) {
    kind = ACTION_KIND.NORMAL;
  }

  const candidate = kind ? actionFor(track, kind, { catchUp, pace }) : null;
  return {
    track,
    kind: kind || (complete ? 'complete' : 'unactionable'),
    candidate,
    complete,
    pace,
    catchUp,
    overdue,
    deadlineToday,
    exceedsCapacity,
    behind,
    weeklyBehind,
    almostComplete
  };
}

/**
 * Return the single highest-priority action. Array order is the stable tie
 * breaker, so equal-priority actions remain predictable.
 */
export function getNextBestAction(tracks = [], { now = new Date() } = {}) {
  const classified = tracks.map((track) => classifyTrack(track, now));
  const candidates = classified
    .map((item, index) => item.candidate ? { ...item.candidate, _index: index } : null)
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority || a._index - b._index);
  if (!candidates.length) return null;
  const { _index, ...action } = candidates[0];
  return action;
}

function defaultExplanation(action, classified) {
  if (!action) return null;
  const item = classified.find((entry) => entry.candidate?.key === action.key);
  if (!item) return null;
  const track = item.track;
  if (action.detail) return action.detail;
  if (item.overdue) return `${track.name || track.key} is past its target date.`;
  if (item.deadlineToday) return `${track.name || track.key} is due today and still has work remaining.`;
  if (item.exceedsCapacity) return `${track.name || track.key} needs more than the available pace to finish on time.`;
  if (item.behind) return `${track.name || track.key} is behind its expected pace.`;
  if (item.weeklyBehind) return `${track.name || track.key} is behind this week's target.`;
  if (item.almostComplete) return `${track.name || track.key} is close to completion.`;
  return `Continue with ${track.name || track.key}.`;
}

/**
 * Build the complete student-facing interpretation from normalized track data.
 * This function never writes data and never invents a failure when a source is
 * unavailable.
 */
export function buildProgressCoach(context = {}, { now = new Date() } = {}) {
  const tracks = Array.isArray(context.tracks)
    ? context.tracks
    : Object.values(context.tracks || {});
  const classified = tracks.map((track) => classifyTrack(track, now));
  const applicable = classified.filter((item) => item.kind !== 'inactive');
  const unavailable = applicable.filter((item) => item.kind === 'unavailable');
  const available = applicable.filter((item) => item.kind !== 'unavailable');
  const action = getNextBestAction(tracks, { now });
  const explanation = defaultExplanation(action, classified);
  const hasNormalOrMeaningfulAction = available.some((item) => item.candidate);
  const allComplete = available.length > 0 && available.every((item) => item.complete);
  const hasActivity = context.hasActivity ?? available.some((item) => item.track.hasActivity !== false);

  let status;
  let completion = false;
  if (unavailable.length) {
    status = COACH_STATUS.UNAVAILABLE;
  } else if (action?.kind === ACTION_KIND.OVERDUE || action?.kind === ACTION_KIND.CRITICAL_DEADLINE) {
    status = COACH_STATUS.ACTION_REQUIRED;
  } else if (action && NEEDS_ATTENTION_KINDS.has(action.kind)) {
    status = COACH_STATUS.NEEDS_ATTENTION;
  } else if (allComplete) {
    status = COACH_STATUS.ON_TRACK;
    completion = true;
  } else if (hasNormalOrMeaningfulAction) {
    status = COACH_STATUS.ON_TRACK;
  } else if (!hasActivity) {
    status = COACH_STATUS.NEUTRAL;
  } else {
    status = COACH_STATUS.ON_TRACK;
  }

  const messages = {
    [COACH_STATUS.ON_TRACK]: completion
      ? "You're on track — you've completed this week's active milestones."
      : (explanation || 'Your active journey requirements are on track.'),
    [COACH_STATUS.NEEDS_ATTENTION]: explanation || 'One active journey requirement needs attention.',
    [COACH_STATUS.ACTION_REQUIRED]: explanation || 'One active journey requirement needs action.',
    [COACH_STATUS.NEUTRAL]: 'Your progress will appear here as you participate in your journey.',
    [COACH_STATUS.UNAVAILABLE]: 'Some progress information is temporarily unavailable.'
  };

  return {
    status,
    message: messages[status],
    completion,
    nextAction: action,
    unavailableTracks: unavailable.map((item) => item.track.key),
    evaluatedTracks: available.map((item) => item.track.key)
  };
}

// Kept exported for focused unit tests and for the future API adapter. It is
// intentionally not part of the public HTTP response shape.
export function classifyProgressTrack(track, { now = new Date() } = {}) {
  return classifyTrack(track, now);
}
