import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTracks } from '../server/services/progressCoachState.js';

const goal = (extra = {}) => ({
  status: 'none',
  hasTarget: false,
  remaining: null,
  ...extra
});

function journey(extra = {}) {
  return {
    goals: {
      standup: goal(),
      vibe: goal(),
      spa: goal(),
      project: goal()
    },
    plan: { atSet: {} },
    standups: { sessionsAttended: 0, pollsTotal: 0 },
    vibe: {
      ladder: [
        { key: 'ai', name: 'Fundamentals of AI', pct: 0, prior: false },
        { key: 'mern', name: 'MERN Stack', pct: 0, prior: false }
      ],
      current: { name: 'Fundamentals of AI' },
      weeklyFloor: { met: false }
    },
    spa: { solved: 0, taught: 0 },
    projects: { submitted: false, reviewStatus: null },
    ...extra
  };
}

describe('Progress Coach My Journey adapter', () => {
  test('maps existing goal snapshots into pace inputs', () => {
    const tracks = buildTracks(journey({
      plan: {
        atSet: {
          standup: { remainingMin: 1800, at: '2026-09-01T00:00:00Z' },
          vibe: { remainingPct: 80, at: '2026-09-01T00:00:00Z' },
          spa: { remainingCount: 20, at: '2026-09-01T00:00:00Z' },
          project: { prsRaised: 0, at: '2026-09-01T00:00:00Z' }
        }
      },
      goals: {
        standup: goal({ status: 'active', hasTarget: true, remaining: 1800, targetDate: '2026-09-30T00:00:00Z' }),
        vibe: goal({ status: 'active', hasTarget: true, remaining: 80, targetDate: '2026-09-30T00:00:00Z' }),
        spa: goal({ status: 'active', hasTarget: true, remaining: 20, targetDate: '2026-09-30T00:00:00Z' }),
        project: goal({ status: 'active', hasTarget: true, remaining: 1, targetDate: '2026-09-30T00:00:00Z' })
      }
    }));

    assert.deepEqual(tracks.map(t => t.key), ['standup', 'vibe', 'spa', 'project']);
    assert.equal(tracks[0].remainingAtSet, 1800);
    assert.equal(tracks[0].targetStartedAt, '2026-09-01T00:00:00Z');
    assert.equal(tracks[3].remainingAtSet, 1);
  });

  test('does not create normal actions for a student with no activity or goal', () => {
    const tracks = buildTracks(journey());

    assert.equal(tracks.every(t => t.normalAction === null), true);
  });

  test('creates a normal action when an existing journey goal is active', () => {
    const tracks = buildTracks(journey({
      goals: {
        standup: goal({ status: 'active', hasTarget: true, remaining: 900, targetDate: '2026-09-30T00:00:00Z' }),
        vibe: goal(),
        spa: goal(),
        project: goal()
      }
    }));

    assert.deepEqual(tracks[0].normalAction, { title: 'Keep attending standups' });
  });

  test('does not call an unmet ViBe floor behind without weekly timing semantics', () => {
    const tracks = buildTracks(journey({
      vibe: {
        ladder: [{ key: 'ai', name: 'Fundamentals of AI', pct: 20, prior: false }],
        current: { name: 'Fundamentals of AI' },
        weeklyFloor: { met: false }
      }
    }));

    assert.equal(tracks[1].weekly.behind, false);
    assert.equal(tracks[1].hasActivity, true);
  });
});
