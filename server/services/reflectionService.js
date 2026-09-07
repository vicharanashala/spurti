import Reflection from '../models/Reflection.js';
import ReflectionVote from '../models/ReflectionVote.js';
import ReflectionWeek from '../models/ReflectionWeek.js';
import mongoose from 'mongoose';
import { appendTransactionIdempotent } from './spLedger.js';

const MAX_TEXT_LENGTH = 500;

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function renderReflection(reflection) {
  return {
    id: String(reflection._id),
    weekLabel: reflection.weekLabel,
    learnedText: reflection.learnedText,
    challengedText: reflection.challengedText,
    improvementText: reflection.improvementText,
    appreciationCount: Number(reflection.appreciationCount || 0),
    submittedAt: reflection.submittedAt,
    updatedAt: reflection.updatedAt
  };
}

function getPhaseForWeek(week, now = new Date()) {
  if (!week) return 'none';
  if (now >= week.submissionStart && now <= week.submissionEnd) return 'submission';
  if (now >= week.votingStart && now <= week.votingEnd) return 'voting';
  if (now > week.votingEnd) return 'finalized';
  return 'none';
}

async function resolveWeekByTime(now = new Date()) {
  const openWeek = await ReflectionWeek.findOne({
    submissionStart: { $lte: now },
    votingEnd: { $gte: now }
  }).sort({ submissionStart: -1 }).lean();
  if (openWeek) return openWeek;
  return ReflectionWeek.findOne({ votingEnd: { $lt: now } }).sort({ votingEnd: -1 }).lean();
}

export async function getReflectionWeekStatus() {
  const now = new Date();
  const week = await resolveWeekByTime(now);
  if (!week) return { phase: 'none' };
  return {
    weekLabel: week.weekLabel,
    phase: getPhaseForWeek(week, now),
    submissionStart: week.submissionStart,
    submissionEnd: week.submissionEnd,
    votingStart: week.votingStart,
    votingEnd: week.votingEnd
  };
}

async function resolveVotingWeek(now = new Date()) {
  const week = await ReflectionWeek.findOne({ votingStart: { $lte: now }, votingEnd: { $gte: now } }).sort({ votingStart: -1 }).lean();
  if (!week) throw new BadRequestError('No active voting week');
  return week;
}

export async function getMyReflection(email) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const week = await resolveWeekByTime(now);
  if (!week) return null;
  const reflection = await Reflection.findOne({ weekLabel: week.weekLabel, email: normalizedEmail }).lean();
  if (!reflection) return null;
  return renderReflection(reflection);
}

export async function listReflections() {
  const now = new Date();
  const week = await resolveWeekByTime(now);
  if (!week) return [];
  const rows = await Reflection.find({ weekLabel: week.weekLabel, moderationStatus: 'published' }).sort({ appreciationCount: -1, submittedAt: 1 }).lean();
  return rows.map(renderReflection);
}

export async function submitReflection(email, body = {}) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const week = await resolveWeekByTime(now);
  if (!week) throw new BadRequestError('No active reflection week');
  const phase = getPhaseForWeek(week, now);
  if (phase !== 'submission') throw new BadRequestError('Reflections are not open for submission at this time.');

  const learnedText = String(body.learnedText || '').trim();
  if (!learnedText) throw new BadRequestError('learnedText is required');
  if (learnedText.length > MAX_TEXT_LENGTH) throw new BadRequestError('learnedText is too long');

  const weekLabel = week.weekLabel;

  const reflection = await Reflection.findOneAndUpdate(
    { email: normalizedEmail, weekLabel },
    {
      $set: {
        learnedText,
        challengedText: String(body.challengedText || '').trim(),
        improvementText: String(body.improvementText || '').trim(),
        moderationStatus: 'published',
        updatedAt: now
      },
      $setOnInsert: { submittedAt: now }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  await appendTransactionIdempotent(
    normalizedEmail,
    'reflection',
    weekLabel,
    now,
    2,
    `Reflection submission for ${weekLabel}`,
    `reflection_submission:${normalizedEmail}:${weekLabel}`,
    'reflection'
  );

  return renderReflection(reflection);
}

function isTransactionUnsupportedError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('transactions are not supported') ||
         msg.includes('transaction numbers are only allowed') ||
         msg.includes('not supported by storage engine') ||
         msg.includes('current topology does not support sessions') ||
         msg.includes('cannot start transaction');
}

async function voteReflectionWithoutTransaction(voteDoc, reflectionId) {
  let vote;
  try {
    vote = await ReflectionVote.create(voteDoc);
    await Reflection.updateOne({ _id: reflectionId }, { $inc: { appreciationCount: 1 } });
    return { ok: true };
  } catch (err) {
    if (err?.code === 11000 || err?.codeName === 'DuplicateKey') {
      throw new ConflictError('You have already voted this week.');
    }
    if (vote?._id) {
      await ReflectionVote.deleteOne({ _id: vote._id }).catch(() => {});
    }
    throw err;
  }
}

export async function voteReflection(email, reflectionId) {
  const normalizedEmail = normalizeEmail(email);
  const week = await resolveVotingWeek();
  const reflection = await Reflection.findById(reflectionId).lean();
  if (!reflection || reflection.weekLabel !== week.weekLabel) {
    throw new BadRequestError('Reflection not found for the current voting week.');
  }
  if (reflection.moderationStatus !== 'published') {
    throw new BadRequestError('Reflection is not available for voting.');
  }
  if (normalizeEmail(reflection.email) === normalizedEmail) {
    throw new BadRequestError('You cannot vote for your own reflection.');
  }

  const voteDoc = {
    voterEmail: normalizedEmail,
    reflectionId: reflection._id,
    weekLabel: week.weekLabel
  };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await ReflectionVote.create([voteDoc], { session });
    await Reflection.updateOne({ _id: reflection._id }, { $inc: { appreciationCount: 1 } }, { session });
    await session.commitTransaction();
    return { ok: true };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction().catch(() => {});
    }
    if (err?.code === 11000 || err?.codeName === 'DuplicateKey') {
      throw new ConflictError('You have already voted this week.');
    }
    if (isTransactionUnsupportedError(err)) {
      return await voteReflectionWithoutTransaction(voteDoc, reflection._id);
    }
    throw err;
  } finally {
    session.endSession();
  }
}

export async function toggleAppreciation(email, reflectionId) {
  const normalizedEmail = normalizeEmail(email);
  const week = await resolveVotingWeek();
  const reflection = await Reflection.findById(reflectionId).lean();
  if (!reflection || reflection.weekLabel !== week.weekLabel) {
    throw new BadRequestError('Reflection not found for the current voting week.');
  }
  if (normalizeEmail(reflection.email) === normalizedEmail) {
    throw new BadRequestError('You cannot appreciate your own reflection.');
  }

  const voteExisting = await ReflectionVote.findOne({ voterEmail: normalizedEmail, weekLabel: week.weekLabel }).lean();

  // If an existing vote exists for THIS reflection, remove it (toggle off).
  if (voteExisting && String(voteExisting.reflectionId) === String(reflection._id)) {
    // remove vote and decrement count
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await ReflectionVote.deleteOne({ _id: voteExisting._id }, { session });
      await Reflection.updateOne({ _id: reflection._id }, { $inc: { appreciationCount: -1 } }, { session });
      await session.commitTransaction();
      return { ok: true, voted: false };
    } catch (err) {
      if (session.inTransaction()) await session.abortTransaction().catch(() => {});
      // fallback: non-transactional
      await ReflectionVote.deleteOne({ _id: voteExisting._id }).catch(() => {});
      await Reflection.updateOne({ _id: reflection._id }, { $inc: { appreciationCount: -1 } }).catch(() => {});
      return { ok: true, voted: false };
    } finally {
      session.endSession();
    }
  }

  // No vote exists — create one (unless voter already voted for a different reflection)
  if (voteExisting && String(voteExisting.reflectionId) !== String(reflection._id)) {
    throw new ConflictError('You have already appreciated a reflection this week.');
  }

  const voteDoc = {
    voterEmail: normalizedEmail,
    reflectionId: reflection._id,
    weekLabel: week.weekLabel
  };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await ReflectionVote.create([voteDoc], { session });
    await Reflection.updateOne({ _id: reflection._id }, { $inc: { appreciationCount: 1 } }, { session });
    await session.commitTransaction();
    return { ok: true, voted: true };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction().catch(() => {});
    }
    if (err?.code === 11000 || err?.codeName === 'DuplicateKey') {
      throw new ConflictError('You have already appreciated a reflection this week.');
    }
    if (isTransactionUnsupportedError(err)) {
      // fallback without transaction
      try {
        const v = await ReflectionVote.create(voteDoc);
        await Reflection.updateOne({ _id: reflection._id }, { $inc: { appreciationCount: 1 } });
        return { ok: true, voted: true };
      } catch (e2) {
        if (e2?.code === 11000 || e2?.codeName === 'DuplicateKey') throw new ConflictError('You have already appreciated a reflection this week.');
        throw e2;
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
}

export async function finalizeReflectionWeeks() {
  const now = new Date();
  const weeks = await ReflectionWeek.find({ votingEnd: { $lt: now }, status: { $ne: 'finalized' } }).lean();
  const results = [];

  for (const week of weeks) {
    const topReflections = await Reflection.find({
      weekLabel: week.weekLabel,
      moderationStatus: 'published',
      appreciationCount: { $gte: 1 }
    }).sort({ appreciationCount: -1, submittedAt: 1 }).limit(5).lean();

    const awarded = [];
    for (const reflection of topReflections) {
      await appendTransactionIdempotent(
        normalizeEmail(reflection.email),
        'reflection',
        week.weekLabel,
        now,
        5,
        `Reflection Top 5 award for ${week.weekLabel}`,
        `reflection_top5:${normalizeEmail(reflection.email)}:${week.weekLabel}`,
        'reflection'
      );
      awarded.push(String(reflection._id));
    }

    await ReflectionWeek.updateOne({ _id: week._id }, { $set: { status: 'finalized', finalizedAt: now } });
    results.push({ weekLabel: week.weekLabel, awardedCount: awarded.length, topReflectionIds: awarded });
  }

  return results;
}

export { BadRequestError, ConflictError };
