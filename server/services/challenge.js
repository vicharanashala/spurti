// Challenge Upvote System — vote/resolve logic.
import Student from '../models/Student.js';
import Challenge from '../models/Challenge.js';
import ChallengeVote from '../models/ChallengeVote.js';
import SPTransaction from '../models/SPTransaction.js';

// Apply an SP change and write a matching SP-Bank transaction. Based on applySpDelta
// from vibe.js but uses the challenge category so the SP Bank shows the right reason.
async function applySpWithCategory(email, delta, category, reason) {
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
  if (!student) throw new Error('Student not found');
  const canonicalEmail = student.email;
  const newTotal = (student.totalSp || 0) + delta;
  student.totalSp = newTotal;
  if (newTotal > (student.highestSpEver || 0)) student.highestSpEver = newTotal;
  await student.save();
  const last = await SPTransaction.findOne({ email: canonicalEmail }).sort({ dateTime: -1 }).lean();
  const when = new Date(Math.max(Date.now(), (last?.dateTime ? new Date(last.dateTime).getTime() + 60000 : 0)));
  await SPTransaction.create({
    email: canonicalEmail, studentId: student._id, category, sessionLabel: '',
    deltaMode: 'absolute', deltaValue: delta, appliedDelta: delta, balanceAfter: newTotal, reason, dateTime: when
  });
  return newTotal;
}

// Cast a vote (or add SP to an existing active vote) for a proposed challenge.
// Returns the updated state: { challenges, userVotes, totalSp }.
export async function castVote(email, challengeId, spPoints) {
  const points = Number(spPoints);
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error('SP points must be a positive integer');
  }

  const [challenge, student] = await Promise.all([
    Challenge.findById(challengeId).lean(),
    Student.findOne({ $or: [{ email }, { alternateEmail: email }] })
  ]);
  if (!challenge) throw new Error('Challenge not found');
  if (challenge.status !== 'proposed') throw new Error('Voting is closed for this challenge');
  const now = new Date();
  if (now < new Date(challenge.votingStartDate)) throw new Error('Voting has not started yet');
  if (now > new Date(challenge.votingEndDate)) throw new Error('Voting has ended');
  if (!student) throw new Error('Student not found');
  if (student.totalSp < points) throw new Error('Not enough SP');

  const canonicalEmail = student.email;

  // Re-use existing vote record for this student and challenge (whether active or withdrawn)
  const existing = await ChallengeVote.findOne({ email: canonicalEmail, challengeId });
  if (existing) {
    if (existing.status === 'active') {
      existing.spInvested += points;
    } else {
      existing.status = 'active';
      existing.spInvested = points;
      existing.withdrawnAt = null;
    }
    await existing.save();
  } else {
    await ChallengeVote.create({ email: canonicalEmail, studentId: student._id, challengeId, spInvested: points, status: 'active' });
  }

  await applySpWithCategory(canonicalEmail, -points, 'challenge_vote',
    `Voted ${points} SP on challenge: ${challenge.title}`);
  await Challenge.findByIdAndUpdate(challengeId, { $inc: { totalSpInvested: points } });

  return buildProposedState(canonicalEmail);
}

// Withdraw an active vote and refund the SP.
// Returns the updated state: { challenges, userVotes, totalSp }.
export async function withdrawVote(email, challengeId) {
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) throw new Error('Student not found');
  const canonicalEmail = student.email;

  const vote = await ChallengeVote.findOne({ email: canonicalEmail, challengeId, status: 'active' });
  if (!vote) throw new Error('No active vote found for this challenge');

  const challenge = await Challenge.findById(challengeId).lean();
  if (!challenge) throw new Error('Challenge not found');
  if (challenge.status !== 'proposed') throw new Error('Can only withdraw during voting phase');

  const refundedSp = vote.spInvested;
  vote.status = 'withdrawn';
  vote.withdrawnAt = new Date();
  vote.spInvested = 0;
  await vote.save();

  await applySpWithCategory(canonicalEmail, refundedSp, 'challenge_vote',
    `Withdrew vote — refunded ${refundedSp} SP from challenge: ${challenge.title}`);
  await Challenge.findByIdAndUpdate(challengeId, { $inc: { totalSpInvested: -refundedSp } });

  return buildProposedState(canonicalEmail);
}

// Admin: resolve the voting round — pick the challenge with the highest totalSpInvested,
// set it ACTIVE, archive all others, store winner emails. Returns the winning challenge.
export async function resolveChallenge(resolvingChallengeId) {
  const targetChallenge = await Challenge.findById(resolvingChallengeId).lean();
  if (!targetChallenge) throw new Error('Challenge not found');
  if (targetChallenge.status !== 'proposed') throw new Error('Challenge is not in proposed state');

  const now = new Date();
  if (new Date(targetChallenge.votingEndDate) > now) {
    throw new Error('Cannot resolve: voting window has not ended yet');
  }

  // Find all proposed challenges in the same round (voting ended on or before now)
  const roundChallenges = await Challenge.find({
    status: 'proposed',
    votingEndDate: { $lte: now }
  }).sort({ totalSpInvested: -1 }).lean();

  if (roundChallenges.length === 0) throw new Error('No eligible challenge to resolve');

  // The winner is the one with highest totalSpInvested in this round
  const winner = roundChallenges[0];

  const liveEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Set winner as active
  await Challenge.findByIdAndUpdate(winner._id, {
    $set: { status: 'active', liveStartDate: now, liveEndDate: liveEnd }
  });

  // Archive all other proposed challenges whose voting has ended
  await Challenge.updateMany(
    { status: 'proposed', _id: { $ne: winner._id }, votingEndDate: { $lte: now } },
    { $set: { status: 'archived' } }
  );

  // Store winner emails from active votes on the winning challenge
  const activeVotes = await ChallengeVote.find({
    challengeId: winner._id,
    status: 'active'
  }).lean();
  const winnerEmails = activeVotes.map(v => v.email);
  await Challenge.findByIdAndUpdate(winner._id, { $set: { winnerEmails } });

  return Challenge.findById(winner._id).lean();
}

// Build the proposed challenges state for a student.
async function buildProposedState(email) {
  const challenges = await Challenge.find({
    status: 'proposed'
  }).sort({ votingEndDate: 1 }).lean();

  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  const canonicalEmail = student ? student.email : email;

  const userVotesDocs = await ChallengeVote.find({
    email: canonicalEmail,
    status: 'active',
    challengeId: { $in: challenges.map(c => c._id) }
  }).lean();

  const userVotes = {};
  for (const v of userVotesDocs) {
    userVotes[v.challengeId.toString()] = v.spInvested;
  }

  return { challenges, userVotes, totalSp: student ? student.totalSp : 0 };
}

// Build the active challenge state for a student.
export async function buildActiveState(email) {
  const challenge = await Challenge.findOne({ status: 'active' }).lean();
  if (!challenge) return { challenge: null, enrolled: false };

  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  const canonicalEmail = student ? student.email : email;

  const vote = await ChallengeVote.findOne({
    email: canonicalEmail,
    challengeId: challenge._id,
    status: 'active'
  }).lean();

  return { challenge, enrolled: !!vote };
}

export { buildProposedState };
