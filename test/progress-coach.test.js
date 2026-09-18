import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_KIND,
  COACH_STATUS,
  buildProgressCoach,
  calculateCatchUp,
  expectedRemainingAt,
  getNextBestAction,
  paceSignal
} from '../server/services/progressCoach.js';

const NOW = new Date('2026-09-08T00:00:00Z');

function goal(extra = {}) {
  return {
    status: 'active',
    remaining: 10,
    daysLeft: 5,
    targetDate: '2026-09-13T00:00:00Z',
    perDayUnit: 'day',
    ...extra
  };
}

function track(key, extra = {}) {
  return {
    key,
    name: key,
    dataState: 'available',
    goal: goal(),
    actions: {
      normal: { title: `Continue ${key}` }
    },
    ...extra
  };
}

describe('catch-up calculations', () => {
  test('rounds remaining work up to a whole unit per day', () => {
    assert.equal(calculateCatchUp({ remaining: 26, daysLeft: 2 }), 13);
    assert.equal(calculateCatchUp({ remaining: 5, daysLeft: 2 }), 3);
    assert.equal(calculateCatchUp({ remaining: 120, daysLeft: 2, existingPerDay: 60 }), 60);
  });

  test('does not invent a catch-up rate with no time left or no remaining work', () => {
    assert.equal(calculateCatchUp({ remaining: 5, daysLeft: 0 }), null);
    assert.equal(calculateCatchUp({ remaining: 0, daysLeft: 2 }), null);
    assert.equal(calculateCatchUp({ remaining: 5, daysLeft: null }), null);
  });
});

describe('expected pace', () => {
  test('uses the existing target snapshot as a linear expected pace', () => {
    assert.equal(expectedRemainingAt({
      remainingAtSet: 100,
      startedAt: '2026-09-01T00:00:00Z',
      targetDate: '2026-09-11T00:00:00Z',
      now: '2026-09-06T00:00:00Z'
    }), 50);
  });

  test('clamps expected remaining work at zero after the deadline', () => {
    assert.equal(expectedRemainingAt({
      remainingAtSet: 10,
      startedAt: '2026-09-01T00:00:00Z',
      targetDate: '2026-09-11T00:00:00Z',
      now: '2026-09-20T00:00:00Z'
    }), 0);
  });

  test('reports behind only when a valid baseline exists', () => {
    assert.deepEqual(paceSignal({
      remaining: 60,
      remainingAtSet: 100,
      startedAt: '2026-09-01T00:00:00Z',
      targetDate: '2026-09-11T00:00:00Z',
      now: '2026-09-06T00:00:00Z'
    }), {
      available: true,
      behind: true,
      actualRemaining: 60,
      expectedRemaining: 50
    });

    assert.equal(paceSignal({ remaining: 60 }).available, false);
  });
});

describe('Progress Coach status', () => {
  test('returns ON TRACK when active requirements are on expected pace', () => {
    const result = buildProgressCoach({
      tracks: [track('standup', {
        remainingAtSet: 100,
        targetStartedAt: '2026-09-01T00:00:00Z',
        goal: goal({ remaining: 50 })
      })]
    }, { now: new Date('2026-09-06T00:00:00Z') });

    assert.equal(result.status, COACH_STATUS.ON_TRACK);
    assert.equal(result.nextAction.kind, ACTION_KIND.NORMAL);
  });

  test('returns NEEDS ATTENTION when work is behind but catchable', () => {
    const result = buildProgressCoach({
      tracks: [track('vibe', {
        remainingAtSet: 100,
        targetStartedAt: '2026-09-01T00:00:00Z',
        goal: goal({ remaining: 80 }),
        actions: {
          behind_pace: { title: 'Continue ViBe', detail: 'ViBe is behind this week.' }
        }
      })]
    }, { now: new Date('2026-09-06T00:00:00Z') });

    assert.equal(result.status, COACH_STATUS.NEEDS_ATTENTION);
    assert.equal(result.nextAction.kind, ACTION_KIND.BEHIND_PACE);
    assert.equal(result.message, 'ViBe is behind this week.');
  });

  test('returns ACTION REQUIRED for an overdue goal', () => {
    const result = buildProgressCoach({
      tracks: [track('spa', {
        goal: goal({ status: 'missed', daysLeft: 0, remaining: 3 }),
        actions: { overdue: { title: 'Finish SPA work' } }
      })]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.ACTION_REQUIRED);
    assert.equal(result.nextAction.kind, ACTION_KIND.OVERDUE);
  });

  test('deadline-day action outranks an almost-complete activity', () => {
    const result = buildProgressCoach({
      tracks: [
        track('standup', {
          goal: goal({ daysLeft: 0, remaining: 4 }),
          actions: { critical_deadline: { title: 'Catch up on standups' } }
        }),
        track('project', {
          goal: goal({ remaining: 1 }),
          completionUnit: 1,
          actions: { almost_complete: { title: 'Submit the final PR' } }
        })
      ]
    }, { now: NOW });

    assert.equal(result.nextAction.trackKey, 'standup');
    assert.equal(result.nextAction.kind, ACTION_KIND.CRITICAL_DEADLINE);
    assert.equal(result.status, COACH_STATUS.ACTION_REQUIRED);
    assert.equal(result.message, 'standup is due today and still has work remaining.');
  });

  test('an overdue activity outranks a normal next activity', () => {
    const action = getNextBestAction([
      track('standup', { goal: goal({ status: 'missed', remaining: 40 }), actions: { overdue: { title: 'Attend standups' } } }),
      track('project', { actions: { normal: { title: 'Start project' } } })
    ], { now: NOW });

    assert.equal(action.trackKey, 'standup');
    assert.equal(action.kind, ACTION_KIND.OVERDUE);
  });

  test('selects only one action when multiple requirements need attention', () => {
    const result = buildProgressCoach({
      tracks: [
        track('standup', { goal: goal({ status: 'missed', remaining: 10 }) }),
        track('vibe', { behind: true }),
        track('spa', { weekly: { behind: true } })
      ]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.ACTION_REQUIRED);
    assert.equal(result.nextAction.trackKey, 'standup');
    assert.ok(result.nextAction);
  });

  test('returns a neutral onboarding state when there is no meaningful activity', () => {
    const result = buildProgressCoach({
      hasActivity: false,
      tracks: [track('standup', { goal: {}, actions: {} })]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.NEUTRAL);
    assert.equal(result.nextAction, null);
  });

  test('excludes inactive future tracks from recommendations', () => {
    const result = buildProgressCoach({
      tracks: [
        track('future-project', {
          applicable: false,
          goal: goal({ status: 'missed', remaining: 1 }),
          actions: { overdue: { title: 'This must not be recommended' } }
        }),
        track('spa', { behind: true })
      ]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.NEEDS_ATTENTION);
    assert.equal(result.nextAction.trackKey, 'spa');
    assert.deepEqual(result.evaluatedTracks, ['spa']);
  });

  test('does not convert unavailable data into a failure', () => {
    const result = buildProgressCoach({
      tracks: [track('vibe', { dataState: 'unavailable', actions: {} })]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.UNAVAILABLE);
    assert.deepEqual(result.unavailableTracks, ['vibe']);
    assert.equal(result.nextAction, null);
  });

  test('does not call an unknown remainder overdue', () => {
    const result = buildProgressCoach({
      tracks: [track('vibe', {
        goal: goal({ status: 'missed', remaining: null }),
        actions: {}
      })]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.ON_TRACK);
    assert.equal(result.nextAction, null);
  });

  test('returns completion state without manufacturing another action', () => {
    const result = buildProgressCoach({
      tracks: [
        track('standup', { complete: true, goal: { status: 'achieved', remaining: 0 }, actions: {} }),
        track('spa', { complete: true, goal: { status: 'achieved', remaining: 0 }, actions: {} })
      ]
    }, { now: NOW });

    assert.equal(result.status, COACH_STATUS.ON_TRACK);
    assert.equal(result.completion, true);
    assert.equal(result.nextAction, null);
  });
});
