import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEST_CATALOG,
  dayKeyIST,
  istRangeFromDayKey,
  inIstRange,
  pickThree,
  effectivePollTarget,
  sessionLabelsForDay,
  evaluateMission,
  applyEvaluation,
  questHeadline
} from '../server/services/quests.js';

const CATALOG_CODES = QUEST_CATALOG.map((c) => c.code).sort();

describe('QUEST_CATALOG', () => {
  test('has the four v1 mission types', () => {
    assert.deepEqual(CATALOG_CODES, ['attend_90', 'help_peer', 'learn_task', 'polls_attempt_5']);
  });

  test('poll copy never claims correctness', () => {
    const poll = QUEST_CATALOG.find((c) => c.code === 'polls_attempt_5');
    assert.match(poll.title, /Attempt/i);
    assert.doesNotMatch(poll.title, /correct/i);
    assert.doesNotMatch(poll.description, /correct/i);
  });
});

describe('dayKeyIST', () => {
  test('names the IST calendar date, not the UTC date, around IST midnight', () => {
    // 00:00 IST on 3 Sep = 2026-09-02T18:30:00.000Z
    assert.equal(dayKeyIST(new Date('2026-09-02T18:30:00.000Z')), '2026-09-03');
    // 23:59:59.999 IST on 2 Sep = 2026-09-02T18:29:59.999Z
    assert.equal(dayKeyIST(new Date('2026-09-02T18:29:59.999Z')), '2026-09-02');
  });

  test('mid-afternoon IST stays on that IST day', () => {
    // 14:30 IST = 09:00 UTC
    assert.equal(dayKeyIST(new Date('2026-09-03T09:00:00.000Z')), '2026-09-03');
  });
});

describe('istRangeFromDayKey', () => {
  test('is 24h exclusive-ended, starting at 00:00 IST', () => {
    const { start, end } = istRangeFromDayKey('2026-09-03');
    assert.equal(start.toISOString(), '2026-09-02T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-09-03T18:30:00.000Z');
    assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  });

  test('includes 00:00 IST and excludes the next midnight IST', () => {
    const range = istRangeFromDayKey('2026-09-03');
    assert.equal(inIstRange('2026-09-02T18:30:00.000Z', range), true);
    assert.equal(inIstRange('2026-09-03T18:29:59.999Z', range), true);
    assert.equal(inIstRange('2026-09-03T18:30:00.000Z', range), false);
  });
});

describe('pickThree', () => {
  test('always returns exactly 3 distinct catalog codes', () => {
    const picked = pickThree(QUEST_CATALOG, 'asha@iitrpr.ac.in', '2026-09-03');
    assert.equal(picked.length, 3);
    const codes = picked.map((c) => c.code);
    assert.equal(new Set(codes).size, 3);
    for (const code of codes) assert.ok(CATALOG_CODES.includes(code));
  });

  test('is deterministic for the same email and dayKey', () => {
    const a = pickThree(QUEST_CATALOG, 'asha@iitrpr.ac.in', '2026-09-03').map((c) => c.code);
    const b = pickThree(QUEST_CATALOG, 'asha@iitrpr.ac.in', '2026-09-03').map((c) => c.code);
    assert.deepEqual(a, b);
  });

  test('normalizes email so case does not reshuffle the day', () => {
    const a = pickThree(QUEST_CATALOG, 'Asha@IITRPR.ac.in', '2026-09-03').map((c) => c.code);
    const b = pickThree(QUEST_CATALOG, 'asha@iitrpr.ac.in', '2026-09-03').map((c) => c.code);
    assert.deepEqual(a, b);
  });

  test('different emails on the same day can differ', () => {
    const a = pickThree(QUEST_CATALOG, 'asha@iitrpr.ac.in', '2026-09-03').map((c) => c.code).join();
    const b = pickThree(QUEST_CATALOG, 'bhavin@iitrpr.ac.in', '2026-09-03').map((c) => c.code).join();
    assert.notEqual(a, b);
  });

  test('the same student can draw a different trio on another day', () => {
    const days = [];
    for (let d = 1; d <= 20; d++) {
      const key = `2026-09-${String(d).padStart(2, '0')}`;
      days.push(pickThree(QUEST_CATALOG, 'asha@iitrpr.ac.in', key).map((c) => c.code).join());
    }
    assert.ok(new Set(days).size > 1, 'expected at least two distinct daily draws over 20 days');
  });
});

function facts(partial) {
  return {
    now: new Date('2026-09-03T12:00:00.000Z'),
    dayKey: '2026-09-03',
    range: istRangeFromDayKey('2026-09-03'),
    sessionLabels: ['Day 64 (3 Sep)'],
    attendance: [],
    polls: [],
    txns: [],
    ...partial
  };
}

describe('evaluateMission attend_90', () => {
  test('89.9 stays pending; 90 and 100 complete', () => {
    const labels = ['Day 64 (3 Sep)'];
    assert.equal(evaluateMission('attend_90', facts({
      sessionLabels: labels,
      attendance: [{ sessionLabel: labels[0], attendancePercentage: 89.9 }]
    })).complete, false);
    assert.equal(evaluateMission('attend_90', facts({
      sessionLabels: labels,
      attendance: [{ sessionLabel: labels[0], attendancePercentage: 90 }]
    })).complete, true);
    assert.equal(evaluateMission('attend_90', facts({
      sessionLabels: labels,
      attendance: [{ sessionLabel: labels[0], attendancePercentage: 100 }]
    })).complete, true);
  });

  test('empty attendance is pending at 0', () => {
    const result = evaluateMission('attend_90', facts({ attendance: [] }));
    assert.equal(result.complete, false);
    assert.equal(result.progress.current, 0);
  });

  test('ignores another day\'s sessionLabel', () => {
    const result = evaluateMission('attend_90', facts({
      sessionLabels: ['Day 64 (3 Sep)'],
      attendance: [{ sessionLabel: 'Day 63 (2 Sep)', attendancePercentage: 100 }]
    }));
    assert.equal(result.complete, false);
  });

  test('completes if any of today\'s sessions is at least 90%', () => {
    const result = evaluateMission('attend_90', facts({
      sessionLabels: ['Morning', 'Evening'],
      attendance: [
        { sessionLabel: 'Morning', attendancePercentage: 40 },
        { sessionLabel: 'Evening', attendancePercentage: 92 }
      ]
    }));
    assert.equal(result.complete, true);
    assert.equal(result.progress.current, 92);
  });
});

describe('evaluateMission polls_attempt_5', () => {
  test('0–4 attempts with 5+ questions stay pending', () => {
    for (const n of [0, 1, 4]) {
      const result = evaluateMission('polls_attempt_5', facts({
        polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: n, totalQuestions: 8 }]
      }));
      assert.equal(result.complete, false, `${n} attempts should be pending`);
    }
  });

  test('5 attempts complete', () => {
    const result = evaluateMission('polls_attempt_5', facts({
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 5, totalQuestions: 8 }]
    }));
    assert.equal(result.complete, true);
    assert.equal(result.progress.target, 5);
  });

  test('when only 3 polls launched, attempting all 3 completes', () => {
    const result = evaluateMission('polls_attempt_5', facts({
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 3, totalQuestions: 3 }]
    }));
    assert.equal(result.complete, true);
    assert.equal(result.progress.target, 3);
  });

  test('zero questions and zero attempts stay pending', () => {
    const result = evaluateMission('polls_attempt_5', facts({
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 0, totalQuestions: 0 }]
    }));
    assert.equal(result.complete, false);
    assert.equal(effectivePollTarget(0), 5);
  });

  test('a +10 poll SP txn with zero attempts does not complete the mission', () => {
    const result = evaluateMission('polls_attempt_5', facts({
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 0, totalQuestions: 8 }],
      txns: [{
        category: 'poll',
        appliedDelta: 10,
        dateTime: '2026-09-03T09:00:00.000Z',
        sessionLabel: 'Day 64 (3 Sep)'
      }]
    }));
    assert.equal(result.complete, false);
  });

  test('progress note states attempts, not correctness', () => {
    const result = evaluateMission('polls_attempt_5', facts({
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 2, totalQuestions: 8 }]
    }));
    assert.match(result.progress.note, /attempts/i);
    assert.doesNotMatch(result.progress.note, /correct/i);
  });
});

describe('evaluateMission help_peer', () => {
  test('a same-day query credit completes', () => {
    const result = evaluateMission('help_peer', facts({
      txns: [{
        category: 'query',
        appliedDelta: 5,
        dateTime: '2026-09-03T10:00:00.000Z',
        sessionLabel: ''
      }]
    }));
    assert.equal(result.complete, true);
    assert.equal(result.progress.current, 1);
  });

  test('zero or negative query delta stays pending', () => {
    assert.equal(evaluateMission('help_peer', facts({
      txns: [{ category: 'query', appliedDelta: 0, dateTime: '2026-09-03T10:00:00.000Z' }]
    })).complete, false);
    assert.equal(evaluateMission('help_peer', facts({
      txns: [{ category: 'query', appliedDelta: -5, dateTime: '2026-09-03T10:00:00.000Z' }]
    })).complete, false);
  });

  test('attendance, poll, and spa txns are not help', () => {
    const when = '2026-09-03T10:00:00.000Z';
    for (const category of ['attendance', 'poll', 'spa']) {
      assert.equal(evaluateMission('help_peer', facts({
        txns: [{ category, appliedDelta: 10, dateTime: when }]
      })).complete, false, category);
    }
  });

  test('a query just outside the IST day stays pending', () => {
    const result = evaluateMission('help_peer', facts({
      txns: [{
        category: 'query',
        appliedDelta: 5,
        dateTime: '2026-09-03T18:30:00.000Z'
      }]
    }));
    assert.equal(result.complete, false);
  });
});

describe('evaluateMission learn_task', () => {
  test('one poll attempt today completes', () => {
    assert.equal(evaluateMission('learn_task', facts({
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 1, totalQuestions: 8 }]
    })).complete, true);
  });

  test('any attendance minutes today complete', () => {
    assert.equal(evaluateMission('learn_task', facts({
      attendance: [{ sessionLabel: 'Day 64 (3 Sep)', attendedMinutes: 12, attendancePercentage: 20 }]
    })).complete, true);
  });

  test('neither attempt nor minutes stays pending', () => {
    assert.equal(evaluateMission('learn_task', facts({
      attendance: [{ sessionLabel: 'Day 64 (3 Sep)', attendedMinutes: 0, attendancePercentage: 0 }],
      polls: [{ sessionLabel: 'Day 64 (3 Sep)', attemptedQuestions: 0, totalQuestions: 8 }]
    })).complete, false);
  });
});

describe('applyEvaluation', () => {
  test('already-complete missions stay complete even with empty facts', () => {
    const stored = [{
      code: 'attend_90',
      icon: '🎯',
      title: "Attend 90%+ of today's session",
      description: 'Be present.',
      status: 'complete',
      completedAt: '2026-09-03T11:00:00.000Z',
      progress: { current: 94, target: 90, unit: 'percent' }
    }];
    const out = applyEvaluation(stored, facts({ attendance: [], sessionLabels: [] }));
    assert.equal(out[0].status, 'complete');
    assert.equal(out[0].completedAt, '2026-09-03T11:00:00.000Z');
    assert.equal(out[0].progress.current, 94);
  });
});

describe('evaluateMission returns no SP side effects', () => {
  test('result keys are complete, progress, evidence — never ledger fields', () => {
    const result = evaluateMission('help_peer', facts({
      txns: [{ category: 'query', appliedDelta: 5, dateTime: '2026-09-03T10:00:00.000Z' }]
    }));
    assert.deepEqual(Object.keys(result).sort(), ['complete', 'evidence', 'progress']);
    assert.equal('totalSp' in result, false);
    assert.equal('appliedDelta' in result, false);
    assert.equal('appliedDelta' in result.progress, false);
  });
});

describe('questHeadline', () => {
  test('partial and complete copy', () => {
    assert.equal(questHeadline(2, 3), "Today's Quest: 2/3 completed");
    assert.equal(questHeadline(3, 3), "Today's Quest: 3/3 completed 🎉");
  });
});

describe('sessionLabelsForDay', () => {
  test('prefers Session.date IST day over txn labels', () => {
    const range = istRangeFromDayKey('2026-09-03');
    const labels = sessionLabelsForDay('2026-09-03', [
      { label: 'Day 64 (3 Sep)', date: new Date('2026-09-03T09:00:00.000Z') }
    ], [{ sessionLabel: 'Other', dateTime: '2026-09-03T10:00:00.000Z' }], range);
    assert.deepEqual(labels, ['Day 64 (3 Sep)']);
  });

  test('falls back to txn sessionLabels in the IST window', () => {
    const range = istRangeFromDayKey('2026-09-03');
    const labels = sessionLabelsForDay('2026-09-03', [], [
      { sessionLabel: 'Day 64 (3 Sep)', dateTime: '2026-09-03T10:00:00.000Z' }
    ], range);
    assert.deepEqual(labels, ['Day 64 (3 Sep)']);
  });
});
