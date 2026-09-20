import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shareCaption } from '../client/src/shareCard.js';

// shareCaption is the text a student pastes into LinkedIn. It is worth testing
// because it is the only part of the share flow we can still see: once the text
// is pasted, the student edits it inside LinkedIn's own composer and nothing
// downstream is observable.

const milestone = (achId, extra = {}) =>
  ({ achId, kind: 'milestone', board: '', place: 0, period: 'All-time', title: 'x', ...extra });
const rank = (board, place, extra = {}) =>
  ({ achId: `rank:${board}:week:2026-08-10:${place}`, kind: 'rank', board, place, period: 'Aug 10–16', title: 'Cohort Champion', ...extra });

describe('shareCaption — rank cards', () => {
  test('says the place in words, because the text has no medal to show it', () => {
    // All three podium places share one title; only the medal drawn on the card
    // distinguishes them. In plain text a 3rd place would read as an outright win.
    assert.match(shareCaption(rank('total', 3)), /Cohort Champion — 3rd place — Aug 10–16/);
    assert.match(shareCaption(rank('total', 1)), /1st place/);
    assert.match(shareCaption(rank('total', 2)), /2nd place/);
  });

  test('each board gets its own explanation and its own quote', () => {
    const total = shareCaption(rank('total', 1));
    const query = shareCaption(rank('query', 1));
    assert.notEqual(total, query);
    assert.match(total, /Top of the cohort on overall points/);
    assert.match(query, /answered when other interns were stuck/);
  });

  test('an unknown board degrades to a caption rather than printing undefined', () => {
    const out = shareCaption(rank('no-such-board', 1));
    assert.doesNotMatch(out, /undefined/);
    assert.match(out, /1st place/);
  });
});

describe('shareCaption — milestone cards', () => {
  test('the Legend threshold is read from the card, never hardcoded', () => {
    // The threshold is a server-side number that may be raised. A hardcoded
    // 1,500 would keep appearing in captions long after cards stopped meaning it.
    assert.match(shareCaption(milestone('ms:legend', { detail: 'Crossed 1,500 SP' })), /1,500 Spurti Points/);
    assert.match(shareCaption(milestone('ms:legend', { detail: 'Crossed 2,000 SP' })), /2,000 Spurti Points/);
  });

  test('a Legend card with no parseable detail still produces text', () => {
    const out = shareCaption(milestone('ms:legend', { detail: '' }));
    assert.match(out, /The Legend badge/);
    assert.doesNotMatch(out, /undefined|NaN/);
  });

  test('level cards state the points, formatted for an Indian reader', () => {
    assert.match(shareCaption(milestone('ms:level:10')), /1,000 Spurti Points/);
    assert.match(shareCaption(milestone('ms:level:25')), /2,500 Spurti Points/);
  });

  test('the 3,600-minute club explains what the number is', () => {
    // The card itself says only "3,600-Minute Club", which means nothing to an
    // outsider. The caption is currently the only place the unit appears.
    assert.match(shareCaption(milestone('ms:club3600')), /3,600 minutes of standups/);
  });

  test('milestones carry no place and no week', () => {
    const out = shareCaption(milestone('ms:level:10'));
    assert.doesNotMatch(out, /place/);
    assert.doesNotMatch(out, /Aug/);
  });
});

describe('shareCaption — shape', () => {
  test('the verify link is included when there is one, and skipped when not', () => {
    const withUrl = shareCaption(rank('total', 1), 'https://samagama.in/spurti/verify/SPRT-AAAA-BBBB');
    assert.match(withUrl, /Verified here, if anyone wants to check:/);
    assert.match(withUrl, /SPRT-AAAA-BBBB/);

    const without = shareCaption(rank('total', 1));
    assert.doesNotMatch(without, /Verified here/);
  });

  test('hashtags are always last', () => {
    const lines = shareCaption(rank('total', 1), 'https://x/y').trim().split('\n');
    assert.match(lines.at(-1), /^#Spurti /);
  });

  test('no double blank lines survive', () => {
    // Blank entries are filtered so a missing section does not leave a gap that
    // looks like a formatting bug in someone's public post.
    const out = shareCaption(milestone('ms:level:10'), 'https://x/y');
    assert.doesNotMatch(out, /\n\n\n/);
  });

  test('never leaks a placeholder into a public post', () => {
    for (const a of [milestone('ms:legend'), milestone('ms:level:5'), milestone('ms:club3600'),
                     rank('total', 1), rank('poll', 2), rank('attendance', 3), rank('spa', 1)]) {
      const out = shareCaption(a, 'https://x/y');
      assert.doesNotMatch(out, /undefined|NaN|\[object/, `placeholder leaked for ${a.achId}`);
    }
  });
});
