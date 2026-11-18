import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { leagueBand, levelFor } from '../server/services/levels.js';
import {
  LEAGUES, TIERS, leagueName, leagueIndex, tierKey, nextLeague, tierTrack, levelProgress,
  initials, hueFor, pollSortKey, recentSessionDots, snapshotOf, celebration
} from '../client/src/progress.js';

describe('league table stays in step with the server', () => {
  test('leagueName agrees with server leagueBand for every SP from 0 to 2000', () => {
    // The client keeps its own copy of the bands so the ladder can be drawn without
    // a round trip. This is what stops the two copies drifting apart.
    for (let sp = 0; sp <= 2000; sp++) {
      assert.equal(leagueName(sp), leagueBand(sp), `mismatch at ${sp} SP`);
    }
  });

  test('bad input falls back to the lowest band, like the server', () => {
    assert.equal(leagueName(-40), leagueBand(-40));
    assert.equal(leagueName(null), leagueBand(null));
    assert.equal(leagueName('nope'), leagueBand('nope'));
  });

  test('tiers are 300 SP wide and start where their first band starts', () => {
    assert.equal(TIERS.length, 6);
    for (const t of TIERS) {
      assert.equal(leagueName(t.from).split(' ')[0], t.name, `${t.name} should begin at ${t.from}`);
    }
    assert.equal(LEAGUES.length, 16);
  });
});

describe('levelProgress', () => {
  test('agrees with server levelFor and reports the remainder', () => {
    for (const hs of [0, 1, 99, 100, 180, 499, 500, 1284, 2500]) {
      assert.equal(levelProgress(hs).level, levelFor(hs));
    }
    assert.deepEqual(levelProgress(180), { level: 1, nextLevel: 2, into: 80, span: 100, pct: 80, toNext: 20 });
    assert.equal(levelProgress(200).toNext, 100);      // just reached a level: full bar to go
    assert.equal(levelProgress(null).level, 0);
  });
});

describe('nextLeague', () => {
  test('points at the next band and how far it is', () => {
    assert.deepEqual(nextLeague(180), { name: 'Bronze I', at: 200, toGo: 20 });
    assert.deepEqual(nextLeague(299), { name: 'Silver III', at: 300, toGo: 1 });
    assert.deepEqual(nextLeague(0), { name: 'Bronze II', at: 100, toGo: 100 });
  });
  test('Legend has nothing above it', () => {
    assert.equal(nextLeague(1500), null);
    assert.equal(nextLeague(9999), null);
  });
});

describe('tierTrack', () => {
  test('fills earlier tiers, part-fills the current one, leaves the rest empty', () => {
    const t = tierTrack(450);
    assert.equal(t.current, 1);
    assert.deepEqual(t.segments.map(s => s.fill), [1, 0.5, 0, 0, 0, 0]);
    assert.equal(t.position, 1.5 / 6);
  });
  test('start and Legend are the two ends of the track', () => {
    assert.equal(tierTrack(0).position, 0);
    const top = tierTrack(1800);
    assert.equal(top.position, 1);
    assert.equal(top.current, 5);
    assert.equal(top.segments[5].fill, 1);
    assert.equal(top.segments[5].to, null);
  });
  test('the marker never moves backwards as SP rises', () => {
    let last = -1;
    for (let sp = 0; sp <= 1700; sp += 25) {
      const p = tierTrack(sp).position;
      assert.ok(p >= last, `went backwards at ${sp}`);
      last = p;
    }
  });
});

describe('tierKey / initials / hueFor', () => {
  test('tierKey reads the tier out of a league name', () => {
    assert.equal(tierKey('Bronze II'), 'bronze');
    assert.equal(tierKey('Legend'), 'legend');
    assert.equal(tierKey(undefined), 'bronze');
  });
  test('initials skip parenthesised tags and cope with junk', () => {
    assert.equal(initials('Demo Streak (dummy)'), 'DS');
    assert.equal(initials('aadhya'), 'A');
    assert.equal(initials('  '), '?');
    assert.equal(initials(null), '?');
  });
  test('hueFor is stable and in range', () => {
    assert.equal(hueFor('Aarav Sharma'), hueFor('Aarav Sharma'));
    for (const n of ['A', 'Zed', 'Ünï Çode', '']) {
      const h = hueFor(n);
      assert.ok(h >= 0 && h < 360);
    }
  });
});

describe('pollSortKey (moved from main.jsx, behaviour unchanged)', () => {
  test('orders both label formats chronologically', () => {
    assert.ok(pollSortKey('16 Jul Evening') > pollSortKey('15 Jul Evening'));
    assert.ok(pollSortKey('15 May Evening') > pollSortKey('15 May Morning'));
    assert.ok(pollSortKey('Day 10 (26 May)') > pollSortKey('Day 9 (25 May)'));
    assert.ok(pollSortKey('1 Jun Morning') > pollSortKey('31 May Evening'));
  });
  test('unknown labels sort as oldest', () => {
    assert.equal(pollSortKey('Bonus round'), -1);
    assert.equal(pollSortKey(), -1);
  });
});

describe('recentSessionDots', () => {
  const rows = [
    { sessionLabel: '18 Jul Evening', attendedMinutes: 55 },
    { sessionLabel: '16 Jul Evening', attendedMinutes: 50 },
    { sessionLabel: '17 Jul Evening', attendedMinutes: 0 },
    { sessionLabel: '19 Jul Evening' }
  ];
  test('oldest first, attended means minutes > 0', () => {
    assert.deepEqual(recentSessionDots(rows).map(d => [d.label, d.attended]), [
      ['16 Jul Evening', true], ['17 Jul Evening', false], ['18 Jul Evening', true], ['19 Jul Evening', false]
    ]);
  });
  test('keeps only the most recent n, and tolerates junk', () => {
    assert.deepEqual(recentSessionDots(rows, 2).map(d => d.label), ['18 Jul Evening', '19 Jul Evening']);
    assert.deepEqual(recentSessionDots(null), []);
    assert.deepEqual(recentSessionDots([null, {}, { sessionLabel: '' }]), []);
  });
});

describe('celebration — only ever answers points going UP', () => {
  const at = (sp, level, league) => ({ sp, level, league });
  const before = at(150, 1, 'Bronze II');

  test('a first visit has nothing to compare with, so no confetti', () => {
    assert.equal(celebration(null, at(180, 1, 'Bronze II')).kind, null);
    assert.equal(celebration(undefined, at(180, 1, 'Bronze II')).kind, null);
    assert.equal(celebration({}, at(180, 1, 'Bronze II')).kind, null);
  });
  test('more points -> sp, with the amount and both ends', () => {
    assert.deepEqual(celebration(before, at(180, 1, 'Bronze II')), { kind: 'sp', delta: 30, from: 150, to: 180 });
  });
  test('same points -> nothing', () => {
    assert.equal(celebration(before, at(150, 1, 'Bronze II')).kind, null);
  });
  test('fewer points (a penalty or a rebuild) -> nothing, never a negative banner', () => {
    const c = celebration(before, at(120, 1, 'Bronze II'));
    assert.equal(c.kind, null);
    assert.equal(c.delta, 0);
  });
  test('crossing a level -> level', () => {
    const c = celebration(at(180, 1, 'Bronze II'), at(210, 2, 'Bronze I'));
    assert.equal(c.kind, 'league');           // 200 SP is also a new band, and league outranks level
    const c2 = celebration(at(120, 1, 'Bronze II'), at(190, 2, 'Bronze II'));
    assert.equal(c2.kind, 'level');
    assert.equal(c2.level, 2);
  });
  test('moving up a band -> league, carrying the new name', () => {
    const c = celebration(at(190, 1, 'Bronze II'), at(205, 2, 'Bronze I'));
    assert.equal(c.kind, 'league');
    assert.equal(c.league, 'Bronze I');
  });
  test('an unrecognised old league does not fake a promotion', () => {
    assert.equal(celebration(at(150, 1, ''), at(160, 1, 'Bronze II')).kind, 'sp');
  });
  test('snapshotOf reads the fields the server sends and survives junk', () => {
    assert.deepEqual(snapshotOf({ totalSp: 180, level: 1, trophyLeague: 'Bronze II' }), { sp: 180, level: 1, league: 'Bronze II' });
    assert.deepEqual(snapshotOf(null), { sp: 0, level: 0, league: '' });
  });
});

describe('progressTone', () => {
  test('under 10% red, 10-49% amber, 50%+ normal', async () => {
    const { progressTone } = await import('../client/src/progress.js');
    assert.equal(progressTone(0), '#ef4444');
    assert.equal(progressTone(9.9), '#ef4444');
    assert.equal(progressTone(10), '#f59e0b');
    assert.equal(progressTone(49), '#f59e0b');
    assert.equal(progressTone(50), null);
    assert.equal(progressTone(100), null);
    assert.equal(progressTone(undefined), null);
  });
});

describe('pace (progress vs where you should be today)', () => {
  test('working days: start date is day 1, Sundays are off', async () => {
    const { workingDaysSince } = await import('../client/src/progress.js');
    const start = '2026-07-13T00:00:00.000Z';                    // a Monday
    assert.equal(workingDaysSince(start, new Date(2026, 6, 13, 15)), 1);
    assert.equal(workingDaysSince(start, new Date(2026, 6, 15, 9)), 3);   // Wed = day 3
    assert.equal(workingDaysSince(start, new Date(2026, 6, 19, 9)), 6);   // Sunday adds nothing
    assert.equal(workingDaysSince(start, new Date(2026, 6, 20, 9)), 7);
    assert.equal(workingDaysSince(start, new Date(2026, 6, 1)), 0);       // not started
  });

  test('standups: day 3 expects 180 min (5%); 120 min is on pace, not red', async () => {
    const { expectedPct, paceTone } = await import('../client/src/progress.js');
    const start = '2026-07-13T00:00:00.000Z'; const now = new Date(2026, 6, 15, 9);
    const exp = expectedPct({ track: 'standup', start, now });
    assert.equal(Math.round(exp * 100) / 100, 5);
    assert.equal(paceTone(120 / 3600 * 100, exp), null);                  // 3.3% of 3600 = 67% of today's target
    assert.equal(paceTone(0, exp), '#ef4444');
    assert.equal(paceTone(1, exp), '#f59e0b');                            // 1% vs 5% expected = 20%
  });

  test('the same 4% is red on day 60 but fine on day 3', async () => {
    const { expectedPct, paceTone } = await import('../client/src/progress.js');
    const start = '2026-07-13T00:00:00.000Z';
    assert.equal(paceTone(4, expectedPct({ track: 'standup', start, now: new Date(2026, 6, 15) })), null);
    assert.equal(paceTone(4, expectedPct({ track: 'standup', start, now: new Date(2026, 8, 20) })), '#ef4444');
  });

  test('other tracks: straight line to the goal date, else internship end, else no signal', async () => {
    const { expectedPct } = await import('../client/src/progress.js');
    const start = '2026-07-01T00:00:00.000Z'; const now = new Date(2026, 6, 11);   // 10 days in
    assert.ok(Math.abs(expectedPct({ track: 'vibe', start, goalDate: '2026-07-31T00:00:00.000Z', now }) - 100 / 3) < 1e-9);
    assert.equal(expectedPct({ track: 'vibe', start, end: '2026-07-21T00:00:00.000Z', now }), 50);
    assert.equal(expectedPct({ track: 'vibe', start, now }), null);
    assert.equal(expectedPct({ track: 'vibe', start, goalDate: '2026-07-05T00:00:00.000Z', now }), 100);   // goal date passed
  });

  test('no start date or nothing expected yet -> no colour signal', async () => {
    const { expectedPct, paceTone } = await import('../client/src/progress.js');
    assert.equal(expectedPct({ track: 'standup', start: null }), null);
    assert.equal(paceTone(50, null), null);
    assert.equal(paceTone(0, 0), null);
  });
});
