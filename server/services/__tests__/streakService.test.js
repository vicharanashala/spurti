import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist all mock objects so vi.mock factories can reference them ─────
const {
  sessionMocks, attMocks, pollMocks, spMocks, streakMocks, studentMocks,
} = vi.hoisted(() => {
  function makeChain(retval) {
    const lean = vi.fn().mockResolvedValue(retval);
    const chain = { lean, sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis() };
    return chain;
  }

  return {
    sessionMocks: { find: vi.fn().mockReturnValue(makeChain([])) },
    attMocks:     { find: vi.fn().mockReturnValue(makeChain([])) },
    pollMocks:    { find: vi.fn().mockReturnValue(makeChain([])) },
    spMocks:      { find: vi.fn().mockReturnValue(makeChain([])), create: vi.fn().mockResolvedValue({}) },
    streakMocks: {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        email: '', studentId: '', currentStreak: 0, longestStreak: 0,
        heartsRemaining: 2, heartsUsed: 0, lastQualifyingDate: '', lastProcessedDate: '',
        streakStartDate: null, totalStreakSp: 0, lastHeartUseDate: '', history: [],
        save: vi.fn().mockResolvedValue(true),
      }),
      find: vi.fn().mockReturnValue(makeChain([])),
    },
    studentMocks: {
      findOne: vi.fn().mockReturnValue(makeChain(null)),
      find: vi.fn().mockReturnValue(makeChain([])),
      updateOne: vi.fn().mockResolvedValue({}),
    },
  };
});

// ─── Mock config ───────────────────────────────────────────────────────
vi.mock('../../config.js', () => ({
  STREAK_ATTENDANCE_THRESHOLD: 85,
  STREAK_POLL_THRESHOLD: 85,
  STREAK_INITIAL_HEARTS: 2,
  STREAK_CUTOFF_DATE: '2026-07-16',
}));

// ─── Mock models ───────────────────────────────────────────────────────
vi.mock('../../models/Streak.js', () => ({ default: streakMocks }));
vi.mock('../../models/Student.js', () => ({ default: studentMocks }));
vi.mock('../../models/SPTransaction.js', () => ({ default: spMocks }));
vi.mock('../../models/Session.js', () => ({ default: sessionMocks }));
vi.mock('../../models/AttendanceRecord.js', () => ({ default: attMocks }));
vi.mock('../../models/PollRecord.js', () => ({ default: pollMocks }));

import {
  getStreakSpForDay,
  qualifiesForDate,
  getOrCreateStreak,
  processDay,
} from '../streakService.js';

// ─── Helper ────────────────────────────────────────────────────────────
function chain(retval) {
  const lean = vi.fn().mockResolvedValue(retval);
  return { lean, sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis() };
}

// Standard student fixture — starts on cutoff date, eligible for streaks
const ACTIVE_STUDENT = { _id: 'stu123', email: 'test@iitrpr.ac.in', status: 'active', totalSp: 100, internshipStartDate: '2026-07-16' };

// ─── getStreakSpForDay ─────────────────────────────────────────────────
describe('getStreakSpForDay', () => {
  it('returns 1 SP for days 1–9', () => {
    for (let d = 1; d <= 9; d++) expect(getStreakSpForDay(d)).toBe(1);
  });
  it('returns 5 SP for day 10 (milestone)', () => {
    expect(getStreakSpForDay(10)).toBe(5);
  });
  it('returns 1 SP for non-milestone days 11–29', () => {
    for (let d = 11; d <= 29; d++) {
      if (d === 20) continue;
      expect(getStreakSpForDay(d)).toBe(1);
    }
  });
  it('returns 7 SP for day 20 (milestone)', () => {
    expect(getStreakSpForDay(20)).toBe(7);
  });
  it('returns 9 SP for day 30 (milestone)', () => {
    expect(getStreakSpForDay(30)).toBe(9);
  });
  it('returns 2 SP for days 31–39', () => {
    for (let d = 31; d <= 39; d++) expect(getStreakSpForDay(d)).toBe(2);
  });
  it('returns 11 SP for day 40 (milestone)', () => {
    expect(getStreakSpForDay(40)).toBe(11);
  });
  it('returns 2 SP for days 41–49', () => {
    for (let d = 41; d <= 49; d++) expect(getStreakSpForDay(d)).toBe(2);
  });
  it('returns 13 SP for day 50', () => {
    expect(getStreakSpForDay(50)).toBe(13);
  });
  it('returns 15 SP for day 60', () => {
    expect(getStreakSpForDay(60)).toBe(15);
  });
  it('returns 23 SP for day 100', () => {
    expect(getStreakSpForDay(100)).toBe(23);
  });
  it('milestone formula holds for 10th-day multiples 10–100', () => {
    for (let m = 1; m <= 10; m++) {
      expect(getStreakSpForDay(m * 10)).toBe(3 + m * 2);
    }
  });
});

// ─── qualifiesForDate ──────────────────────────────────────────────────
describe('qualifiesForDate', () => {
  const email = 'test@iitrpr.ac.in';

  beforeEach(() => vi.clearAllMocks());

  it('qualifies when attendance >=85% and poll >=85% via records', async () => {
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 90 }]));
    pollMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', totalQuestions: 10, attemptedQuestions: 9 }]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(true);
  });

  it('does not qualify when attendance <85%', async () => {
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 80 }]));
    pollMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', totalQuestions: 10, attemptedQuestions: 9 }]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(false);
  });

  it('does not qualify when poll <85%', async () => {
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 90 }]));
    pollMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', totalQuestions: 10, attemptedQuestions: 5 }]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(false);
  });

  it('qualifies with attendance alone when no poll record', async () => {
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 90 }]));
    pollMocks.find.mockReturnValue(chain([]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(true);
  });

  it('falls back to sptransactions when no sessions on date', async () => {
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find
      .mockReturnValueOnce(chain([{ appliedDelta: 10 }]))
      .mockReturnValueOnce(chain([{ appliedDelta: 10 }]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(true);
  });

  it('does not qualify via sptransactions when appliedDelta <10', async () => {
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find
      .mockReturnValueOnce(chain([{ appliedDelta: 5 }]))
      .mockReturnValueOnce(chain([{ appliedDelta: 10 }]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(false);
  });

  it('qualifies via sptransactions with strong attendance and no polls', async () => {
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find
      .mockReturnValueOnce(chain([{ appliedDelta: 10 }]))
      .mockReturnValueOnce(chain([]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(true);
  });

  it('does not qualify with no data at all', async () => {
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(false);
  });

  it('checks multiple attendance records, qualifies if any pass', async () => {
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([
      { sessionLabel: 'Day 1', attendancePercentage: 80 },
      { sessionLabel: 'Day 1b', attendancePercentage: 90 },
    ]));
    pollMocks.find.mockReturnValue(chain([
      { sessionLabel: 'Day 1b', totalQuestions: 10, attemptedQuestions: 9 },
    ]));
    expect(await qualifiesForDate(email, '2026-07-16')).toBe(true);
  });
});

// ─── getOrCreateStreak ─────────────────────────────────────────────────
describe('getOrCreateStreak', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns existing streak', async () => {
    const existing = { email: 'a@b.com', currentStreak: 5 };
    streakMocks.findOne.mockResolvedValue(existing);
    const result = await getOrCreateStreak('a@b.com', 'sid1');
    expect(result).toBe(existing);
    expect(streakMocks.create).not.toHaveBeenCalled();
  });

  it('creates new streak when none exists', async () => {
    streakMocks.findOne.mockResolvedValue(null);
    const created = { email: 'a@b.com', heartsRemaining: 2 };
    streakMocks.create.mockResolvedValue(created);
    const result = await getOrCreateStreak('a@b.com', 'sid1');
    expect(streakMocks.create).toHaveBeenCalledWith({
      email: 'a@b.com', studentId: 'sid1',
      heartsRemaining: 2, currentStreak: 0, longestStreak: 0, totalStreakSp: 0,
    });
    expect(result).toBe(created);
  });
});

// ─── processDay ────────────────────────────────────────────────────────
describe('processDay', () => {
  const email = 'test@iitrpr.ac.in';
  const studentId = 'stu123';
  let streakDoc;

  function freshStreak(overrides = {}) {
    return {
      email, studentId, currentStreak: 0, longestStreak: 0,
      heartsRemaining: 2, heartsUsed: 0, lastQualifyingDate: '', lastProcessedDate: '',
      streakStartDate: null, totalStreakSp: 0, lastHeartUseDate: '', history: [],
      save: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    streakDoc = freshStreak();
  });

  it('returns processed:false if student not found', async () => {
    studentMocks.findOne.mockReturnValue(chain(null));
    const result = await processDay(email, '2026-07-16');
    expect(result).toEqual({ processed: false });
  });

  it('returns processed:false if student is excused', async () => {
    studentMocks.findOne.mockReturnValue(chain({ _id: studentId, email, status: 'excused', totalSp: 100, internshipStartDate: '2026-07-16' }));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    const result = await processDay(email, '2026-07-16');
    expect(result).toEqual({ processed: false });
  });

  it('returns processed:false if date is Sunday', async () => {
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    const result = await processDay(email, '2026-07-19'); // Sunday
    expect(result).toEqual({ processed: false });
    expect(streakMocks.findOne).not.toHaveBeenCalled();
  });

  it('returns processed:false if student started before cutoff', async () => {
    studentMocks.findOne.mockReturnValue(chain({ ...ACTIVE_STUDENT, internshipStartDate: '2026-07-10' }));
    const result = await processDay(email, '2026-07-16');
    expect(result).toEqual({ processed: false });
  });

  it('returns processed:false if already processed this date', async () => {
    streakDoc.lastProcessedDate = '2026-07-16';
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    const result = await processDay(email, '2026-07-16');
    expect(result).toEqual({ processed: false });
  });

  it('returns processed:false for date before internship start', async () => {
    studentMocks.findOne.mockReturnValue(chain({ ...ACTIVE_STUDENT, internshipStartDate: '2026-07-20' }));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    const result = await processDay(email, '2026-07-17');
    expect(result.processed).toBe(false);
    expect(streakDoc.lastProcessedDate).toBe('2026-07-17');
    expect(streakDoc.save).toHaveBeenCalled();
  });

  it('advances streak when day qualifies', async () => {
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 90 }]));
    pollMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', totalQuestions: 10, attemptedQuestions: 9 }]));

    const result = await processDay(email, '2026-07-16');
    expect(result.processed).toBe(true);
    expect(result.sp).toBe(1);
    expect(result.streak).toBe(1);
    expect(result.heartUsed).toBe(false);
    expect(result.streakBroken).toBe(false);
    expect(streakDoc.currentStreak).toBe(1);
    expect(streakDoc.totalStreakSp).toBe(1);
    expect(streakDoc.lastQualifyingDate).toBe('2026-07-16');
    expect(streakDoc.history).toHaveLength(1);
    expect(streakDoc.history[0]).toEqual({ date: '2026-07-16', sp: 1, type: 'daily' });
    expect(spMocks.create).toHaveBeenCalled();
    expect(studentMocks.updateOne).toHaveBeenCalled();
  });

  it('records milestone type on 10th day', async () => {
    streakDoc = freshStreak({ currentStreak: 9, lastQualifyingDate: '2026-07-25' });
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 90 }]));
    pollMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', totalQuestions: 10, attemptedQuestions: 9 }]));

    const result = await processDay(email, '2026-07-27');
    expect(result.sp).toBe(5);
    expect(streakDoc.currentStreak).toBe(10);
    expect(streakDoc.history[0].type).toBe('milestone');
  });

  it('uses heart on consecutive missed day', async () => {
    streakDoc = freshStreak({ currentStreak: 3, lastQualifyingDate: '2026-07-16', heartsRemaining: 2 });
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find.mockReturnValue(chain([]));

    const result = await processDay(email, '2026-07-17');
    expect(result.heartUsed).toBe(true);
    expect(result.streakBroken).toBe(false);
    expect(streakDoc.heartsRemaining).toBe(1);
    expect(streakDoc.heartsUsed).toBe(1);
    expect(streakDoc.currentStreak).toBe(3);
    expect(streakDoc.lastQualifyingDate).toBe('2026-07-17');
  });

  it('breaks streak when no hearts remain', async () => {
    streakDoc = freshStreak({ currentStreak: 5, lastQualifyingDate: '2026-07-16', heartsRemaining: 0 });
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find.mockReturnValue(chain([]));

    const result = await processDay(email, '2026-07-17');
    expect(result.streakBroken).toBe(true);
    expect(result.heartUsed).toBe(false);
    expect(streakDoc.currentStreak).toBe(0);
    expect(streakDoc.streakStartDate).toBeNull();
  });

  it('does not use heart during backfill', async () => {
    streakDoc = freshStreak({ currentStreak: 3, lastQualifyingDate: '2026-07-16', heartsRemaining: 2 });
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find.mockReturnValue(chain([]));

    const result = await processDay(email, '2026-07-17', { backfill: true });
    expect(result.heartUsed).toBe(false);
    expect(streakDoc.heartsRemaining).toBe(2);
    expect(streakDoc.currentStreak).toBe(3);
  });

  it('updates longestStreak when current exceeds it', async () => {
    streakDoc = freshStreak({ currentStreak: 4, longestStreak: 4, lastQualifyingDate: '2026-07-16' });
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([{ label: 'Day 1' }]));
    attMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', attendancePercentage: 90 }]));
    pollMocks.find.mockReturnValue(chain([{ sessionLabel: 'Day 1', totalQuestions: 10, attemptedQuestions: 9 }]));

    await processDay(email, '2026-07-17');
    expect(streakDoc.longestStreak).toBe(5);
  });

  it('gap logic uses nextWeekday — Saturday qualifies, Monday is consecutive after Friday', async () => {
    // Friday qualifies, Saturday misses (heart), Monday misses — should use 2nd heart (not break)
    streakDoc = freshStreak({ currentStreak: 3, lastQualifyingDate: '2026-07-17', heartsRemaining: 2 }); // Fri Jul 17
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    streakMocks.findOne.mockResolvedValue(streakDoc);
    sessionMocks.find.mockReturnValue(chain([]));
    spMocks.find.mockReturnValue(chain([]));

    // Saturday Jul 18 — heart saves
    const r1 = await processDay(email, '2026-07-18');
    expect(r1.heartUsed).toBe(true);
    expect(streakDoc.heartsRemaining).toBe(1);
    expect(streakDoc.lastQualifyingDate).toBe('2026-07-18'); // heart resets gap

    // Monday Jul 20 — Sunday Jul 19 skipped, Monday is consecutive after Saturday
    const r2 = await processDay(email, '2026-07-20');
    expect(r2.heartUsed).toBe(true);
    expect(streakDoc.heartsRemaining).toBe(0);
    expect(streakDoc.currentStreak).toBe(3); // streak preserved
  });

  it('Sunday is silently skipped — no streak doc lookup', async () => {
    studentMocks.findOne.mockReturnValue(chain(ACTIVE_STUDENT));
    const result = await processDay(email, '2026-07-19'); // Sunday
    expect(result).toEqual({ processed: false });
    expect(streakMocks.findOne).not.toHaveBeenCalled();
  });
});
