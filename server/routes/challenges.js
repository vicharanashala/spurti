import express from 'express';
import mongoose from 'mongoose';
import Challenge from '../models/Challenge.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import { authenticateStudent, validateChallengeAccess } from '../middleware/challengeMiddleware.js';
import { getSimulatedProgress } from '../services/dummyProgress.js';

const router = express.Router();

// Helper to calculate locked SP for a student
export async function getLockedSp(studentId) {
  if (global.isOfflineMode) {
    const activeChallenges = global.offlineChallenges.filter(c =>
      c.status === 'active' &&
      (String(c.challengerId) === String(studentId) || String(c.opponentId) === String(studentId))
    );
    const pendingSentChallenges = global.offlineChallenges.filter(c =>
      c.status === 'pending' &&
      String(c.challengerId) === String(studentId)
    );
    let locked = 0;
    for (const c of activeChallenges) locked += c.betAmount;
    for (const c of pendingSentChallenges) locked += c.betAmount;
    return locked;
  }

  const activeChallenges = await Challenge.find({
    status: 'active',
    $or: [{ challengerId: studentId }, { opponentId: studentId }]
  });

  const pendingSentChallenges = await Challenge.find({
    status: 'pending',
    challengerId: studentId
  });

  let locked = 0;
  for (const c of activeChallenges) {
    locked += c.betAmount;
  }
  for (const c of pendingSentChallenges) {
    locked += c.betAmount;
  }
  return locked;
}

// Helper to write raw SPTransaction bypassing mongoose validation
export async function createChallengeTxn({ email, studentId, category, appliedDelta, balanceAfter, reason }) {
  const doc = {
    email,
    studentId: new mongoose.Types.ObjectId(studentId),
    category, // 'challenge_win' or 'challenge_loss'
    deltaMode: 'absolute',
    deltaValue: Math.abs(appliedDelta),
    appliedDelta,
    balanceAfter,
    reason,
    dateTime: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await SPTransaction.collection.insertOne(doc);
}

// Helper to perform the settlement of an active challenge
export async function settleChallenge(challenge, outcome, reason, settledBy = 'auto') {
  const challenger = await Student.findById(challenge.challengerId);
  const opponent = await Student.findById(challenge.opponentId);

  if (!challenger || !opponent) {
    challenge.status = 'void';
    challenge.resultReason = 'Participants could not be found during settlement.';
    challenge.settledAt = new Date();
    challenge.settledBy = settledBy;
    challenge.auditTrail.push({
      actor: 'system',
      action: 'void',
      detail: challenge.resultReason
    });
    await challenge.save();
    return;
  }

  if (outcome === 'void') {
    challenge.status = 'void';
    challenge.resultReason = reason || 'Challenge voided.';
    challenge.settledAt = new Date();
    challenge.settledBy = settledBy;
    challenge.auditTrail.push({
      actor: settledBy === 'admin' ? 'admin' : 'system',
      action: 'void',
      detail: challenge.resultReason
    });
    await challenge.save();
    return;
  }

  const winner = outcome === 'challenger' ? challenger : opponent;
  const loser = outcome === 'challenger' ? opponent : challenger;

  const bet = challenge.betAmount;

  // Calculate new balances
  const newWinnerSp = winner.totalSp + bet;
  const newLoserSp = Math.max(0, loser.totalSp - bet); // Clamp at 0 just in case

  // Update Students in DB
  await Student.updateOne(
    { _id: winner._id },
    {
      $inc: { totalSp: bet },
      $max: { highestSpEver: newWinnerSp }
    }
  );
  await Student.updateOne(
    { _id: loser._id },
    {
      $inc: { totalSp: -bet }
    }
  );

  // Write SP Transactions bypassing Mongoose enum validation
  await createChallengeTxn({
    email: winner.email,
    studentId: winner._id,
    category: 'challenge_win',
    appliedDelta: bet,
    balanceAfter: newWinnerSp,
    reason: `Won challenge against ${loser.name}: ${challenge.topicRef.label}`
  });

  await createChallengeTxn({
    email: loser.email,
    studentId: loser._id,
    category: 'challenge_loss',
    appliedDelta: -bet,
    balanceAfter: newLoserSp,
    reason: `Lost challenge against ${winner.name}: ${challenge.topicRef.label}`
  });

  // Update Challenge document
  challenge.status = 'completed';
  challenge.winnerId = winner._id;
  challenge.loserId = loser._id;
  challenge.resultReason = reason || `${winner.name} won with higher progress.`;
  challenge.settledAt = new Date();
  challenge.settledBy = settledBy;
  challenge.auditTrail.push({
    actor: settledBy === 'admin' ? 'admin' : 'system',
    action: 'settled',
    detail: `Winner: ${winner.name} (${outcome === 'challenger' ? challenge.progressFinal.challenger : challenge.progressFinal.opponent}), Loser: ${loser.name} (${outcome === 'challenger' ? challenge.progressFinal.opponent : challenge.progressFinal.challenger})`
  });

  await challenge.save();
}

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

// GET /api/challenges/topics
router.get('/topics', (req, res) => {
  const TOPICS = [
    {
      key: 'vibe_course',
      label: 'Vibe Course Progress',
      description: 'Progress in Vibe course completion percentage.'
    },
    {
      key: 'matrix_questions',
      label: 'Matrix Questions',
      description: 'Scores in Matrix set question runs.'
    },
    {
      key: 'poll_accuracy',
      label: 'Poll Accuracy',
      description: 'Correctness and attempt accuracy in daily polls.'
    }
  ];
  res.json({ topics: TOPICS });
});

// GET /api/challenges/peers?q=
router.get('/peers', authenticateStudent, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ matches: [] });

  if (global.isOfflineMode) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = global.offlineStudents.filter(peer =>
      peer.status !== 'excused' &&
      String(peer._id) !== String(req.student._id) &&
      (peer.name.match(new RegExp(escaped, 'i')) || peer.email.match(new RegExp(escaped, 'i')))
    );
    const peers = matches.map(peer => {
      const concurrent = global.offlineChallenges.filter(c =>
        ['pending', 'active'].includes(c.status) &&
        (String(c.challengerId) === String(peer._id) || String(c.opponentId) === String(peer._id))
      ).length;
      const limitExceeded = concurrent >= 3;
      return {
        _id: String(peer._id),
        name: peer.name,
        email: peer.email,
        totalSp: peer.totalSp,
        limitExceeded,
        ineligibleReason: limitExceeded ? 'Opponent already has 3 active/pending challenges.' : ''
      };
    });
    return res.json({ matches: peers });
  }

  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const myId = String(req.student._id);

    // Search active students matching query (name or email)
    const matches = await Student.find({
      status: { $ne: 'excused' },
      _id: { $ne: req.student._id },
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { alternateEmail: { $regex: escaped, $options: 'i' } }
      ]
    }).sort({ name: 1 }).limit(15).lean();

    // Map each matches to include limitExceeded check
    const peers = await Promise.all(matches.map(async (peer) => {
      const concurrentCount = await Challenge.countDocuments({
        status: { $in: ['pending', 'active'] },
        $or: [
          { challengerId: peer._id },
          { opponentId: peer._id }
        ]
      });

      const limitExceeded = concurrentCount >= 3;
      return {
        _id: String(peer._id),
        name: peer.name,
        email: peer.email,
        totalSp: peer.totalSp,
        limitExceeded,
        ineligibleReason: limitExceeded ? 'Opponent already has 3 active/pending challenges.' : ''
      };
    }));

    res.json({ matches: peers });
  } catch (err) {
    console.error('peers search error:', err.message);
    res.status(500).json({ error: 'Failed to search peers.' });
  }
});

// POST /api/challenges
router.post('/', authenticateStudent, async (req, res) => {
  const { opponentEmail, topic, betAmount, durationDays } = req.body;

  if (!opponentEmail || !topic || !betAmount || !durationDays) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const bet = Number(betAmount);
  const duration = Number(durationDays);

  if (global.isOfflineMode) {
    if (isNaN(bet) || bet < 1) {
      return res.status(400).json({ error: 'Wager must be at least 1 SP.' });
    }
    if (isNaN(duration) || duration < 1 || duration > 7) {
      return res.status(400).json({ error: 'Duration must be between 1 and 7 days.' });
    }
    const validTopics = ['vibe_course', 'matrix_questions', 'poll_accuracy'];
    if (!validTopics.includes(topic)) {
      return res.status(400).json({ error: 'Invalid challenge topic.' });
    }

    const opponent = global.offlineStudents.find(s =>
      s.status !== 'excused' &&
      (s.email === opponentEmail.toLowerCase().trim() || s.alternateEmail === opponentEmail.toLowerCase().trim())
    );
    if (!opponent) {
      return res.status(404).json({ error: 'Eligible opponent student not found.' });
    }
    if (String(opponent._id) === String(req.student._id)) {
      return res.status(400).json({ error: 'You cannot challenge yourself.' });
    }
    const challengerConcurrent = global.offlineChallenges.filter(c =>
      ['pending', 'active'].includes(c.status) &&
      (String(c.challengerId) === String(req.student._id) || String(c.opponentId) === String(req.student._id))
    ).length;
    if (challengerConcurrent >= 3) {
      return res.status(400).json({ error: 'You already have 3 active or pending challenges.' });
    }
    const opponentConcurrent = global.offlineChallenges.filter(c =>
      ['pending', 'active'].includes(c.status) &&
      (String(c.challengerId) === String(opponent._id) || String(c.opponentId) === String(opponent._id))
    ).length;
    if (opponentConcurrent >= 3) {
      return res.status(400).json({ error: 'Opponent already has 3 active or pending challenges.' });
    }
    const lockedSp = await getLockedSp(req.student._id);
    const availableSp = req.student.totalSp - lockedSp;
    if (availableSp < bet) {
      return res.status(400).json({ error: `You only have ${availableSp} available SP (Wager requires ${bet} SP).` });
    }
    const requestedAt = new Date();
    const respondTimeoutAt = new Date(requestedAt.getTime() + 2 * 60 * 60 * 1000);
    const topicLabels = { vibe_course: 'Vibe Course Progress', matrix_questions: 'Matrix Questions', poll_accuracy: 'Poll Accuracy' };
    const challenge = {
      _id: new mongoose.Types.ObjectId().toString(),
      challengerId: String(req.student._id),
      challengerEmail: req.student.email,
      challengerName: req.student.name,
      opponentId: String(opponent._id),
      opponentEmail: opponent.email,
      opponentName: opponent.name,
      topic,
      topicRef: {
        label: `${topicLabels[topic]} Challenge (Wager: ${bet} SP)`,
        windowStart: requestedAt,
        windowEnd: new Date(requestedAt.getTime() + duration * 24 * 60 * 60 * 1000)
      },
      betAmount: bet,
      status: 'pending',
      requestedAt,
      respondTimeoutAt,
      createdAt: requestedAt,
      updatedAt: requestedAt,
      auditTrail: [{
        actor: req.student.name,
        action: 'create',
        detail: `Issued ${duration}-day challenge to ${opponent.name} with ${bet} SP bet.`
      }]
    };
    global.offlineChallenges.push(challenge);
    return res.status(201).json({ challenge });
  }

  if (isNaN(bet) || bet < 1) {
    return res.status(400).json({ error: 'Wager must be at least 1 SP.' });
  }

  if (isNaN(duration) || duration < 1 || duration > 7) {
    return res.status(400).json({ error: 'Duration must be between 1 and 7 days.' });
  }

  const validTopics = ['vibe_course', 'matrix_questions', 'poll_accuracy'];
  if (!validTopics.includes(topic)) {
    return res.status(400).json({ error: 'Invalid challenge topic.' });
  }

  try {
    // 1. Find opponent
    const opponent = await Student.findOne({
      status: { $ne: 'excused' },
      $or: [
        { email: opponentEmail.toLowerCase().trim() },
        { alternateEmail: opponentEmail.toLowerCase().trim() }
      ]
    });

    if (!opponent) {
      return res.status(404).json({ error: 'Eligible opponent student not found.' });
    }

    if (String(opponent._id) === String(req.student._id)) {
      return res.status(400).json({ error: 'You cannot challenge yourself.' });
    }

    // 2. Check challenger limits
    const challengerConcurrent = await Challenge.countDocuments({
      status: { $in: ['pending', 'active'] },
      $or: [{ challengerId: req.student._id }, { opponentId: req.student._id }]
    });

    if (challengerConcurrent >= 3) {
      return res.status(400).json({ error: 'You already have 3 active or pending challenges.' });
    }

    // 3. Check opponent limits
    const opponentConcurrent = await Challenge.countDocuments({
      status: { $in: ['pending', 'active'] },
      $or: [{ challengerId: opponent._id }, { opponentId: opponent._id }]
    });

    if (opponentConcurrent >= 3) {
      return res.status(400).json({ error: 'Opponent already has 3 active or pending challenges.' });
    }

    // 4. Verify challenger SP
    const lockedSp = await getLockedSp(req.student._id);
    const availableSp = req.student.totalSp - lockedSp;

    if (availableSp < bet) {
      return res.status(400).json({ error: `You only have ${availableSp} available SP (Wager requires ${bet} SP).` });
    }

    // 5. Create Challenge
    const topicLabels = {
      vibe_course: 'Vibe Course Progress',
      matrix_questions: 'Matrix Questions',
      poll_accuracy: 'Poll Accuracy'
    };

    const requestedAt = new Date();
    const respondTimeoutAt = new Date(requestedAt.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    const challenge = new Challenge({
      challengerId: req.student._id,
      challengerEmail: req.student.email,
      challengerName: req.student.name,
      opponentId: opponent._id,
      opponentEmail: opponent.email,
      opponentName: opponent.name,
      topic,
      topicRef: {
        label: `${topicLabels[topic]} Challenge (Wager: ${bet} SP)`,
        windowStart: requestedAt,
        windowEnd: new Date(requestedAt.getTime() + duration * 24 * 60 * 60 * 1000)
      },
      betAmount: bet,
      status: 'pending',
      requestedAt,
      respondTimeoutAt,
      auditTrail: [{
        actor: req.student.name,
        action: 'create',
        detail: `Issued ${duration}-day challenge to ${opponent.name} with ${bet} SP bet.`
      }]
    });

    await challenge.save();
    res.status(201).json({ challenge });
  } catch (err) {
    console.error('create challenge error:', err.message);
    res.status(500).json({ error: 'Failed to create challenge.' });
  }
});

// GET /api/challenges/mine
router.get('/mine', authenticateStudent, async (req, res) => {
  const myId = req.student._id;

  if (global.isOfflineMode) {
    try {
      const all = JSON.parse(JSON.stringify(global.offlineChallenges.filter(c =>
        String(c.challengerId) === String(myId) || String(c.opponentId) === String(myId)
      )));
      const lockedSp = await getLockedSp(myId);
      const sentPending = [];
      const receivedPending = [];
      const active = [];
      const history = [];
      const now = Date.now();
      for (const c of all) {
        if (c.status === 'pending') {
          c.respondTimeoutSec = Math.max(0, Math.floor((new Date(c.respondTimeoutAt).getTime() - now) / 1000));
          if (String(c.challengerId) === String(myId)) sentPending.push(c);
          else receivedPending.push(c);
        } else if (c.status === 'active') {
          c.endAtSec = Math.max(0, Math.floor((new Date(c.topicRef.windowEnd).getTime() - now) / 1000));
          c.liveProgress = {
            challenger: getSimulatedProgress(c._id, c.challengerId, c.topic, 0.5),
            opponent: getSimulatedProgress(c._id, c.opponentId, c.topic, 0.5)
          };
          active.push(c);
        } else {
          history.push(c);
        }
      }
      return res.json({
        profile: {
          totalSp: req.student.totalSp,
          availableSp: req.student.totalSp - lockedSp,
          lockedSp
        },
        sentPending,
        receivedPending,
        active,
        history
      });
    } catch (err) {
      console.error('mine challenges error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
  }

  try {
    const all = await Challenge.find({
      $or: [{ challengerId: myId }, { opponentId: myId }]
    }).lean();

    const lockedSp = await getLockedSp(myId);

    const sentPending = [];
    const receivedPending = [];
    const active = [];
    const history = [];

    const now = Date.now();

    for (const c of all) {
      // Inject countdown if pending or active
      if (c.status === 'pending') {
        c.respondTimeoutSec = Math.max(0, Math.floor((new Date(c.respondTimeoutAt).getTime() - now) / 1000));
        if (String(c.challengerId) === String(myId)) {
          sentPending.push(c);
        } else {
          receivedPending.push(c);
        }
      } else if (c.status === 'active') {
        c.endAtSec = Math.max(0, Math.floor((new Date(c.endAt).getTime() - now) / 1000));
        // Compute live progress percentages
        const elapsed = (now - new Date(c.startAt).getTime()) / (new Date(c.endAt).getTime() - new Date(c.startAt).getTime());
        c.liveProgress = {
          challenger: getSimulatedProgress(c._id, c.challengerId, c.topic, elapsed),
          opponent: getSimulatedProgress(c._id, c.opponentId, c.topic, elapsed)
        };
        active.push(c);
      } else {
        history.push(c);
      }
    }

    // Sort outputs
    const sortByCreatedAt = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
    const sortByUpdatedAt = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);

    sentPending.sort(sortByCreatedAt);
    receivedPending.sort(sortByCreatedAt);
    active.sort(sortByCreatedAt);
    history.sort(sortByUpdatedAt);

    res.json({
      profile: {
        totalSp: req.student.totalSp,
        availableSp: req.student.totalSp - lockedSp,
        lockedSp
      },
      sentPending,
      receivedPending,
      active,
      history
    });
  } catch (err) {
    console.error('mine challenges error:', err.message);
    res.status(500).json({ error: 'Failed to fetch challenges.' });
  }
});

// GET /api/challenges/:id
router.get('/:id', authenticateStudent, validateChallengeAccess, async (req, res) => {
  const c = req.challenge.toObject();
  const now = Date.now();

  if (c.status === 'pending') {
    c.respondTimeoutSec = Math.max(0, Math.floor((new Date(c.respondTimeoutAt).getTime() - now) / 1000));
  } else if (c.status === 'active') {
    c.endAtSec = Math.max(0, Math.floor((new Date(c.endAt).getTime() - now) / 1000));
    const elapsed = (now - new Date(c.startAt).getTime()) / (new Date(c.endAt).getTime() - new Date(c.startAt).getTime());
    c.liveProgress = {
      challenger: getSimulatedProgress(c._id, c.challengerId, c.topic, elapsed),
      opponent: getSimulatedProgress(c._id, c.opponentId, c.topic, elapsed)
    };
  } else {
    c.liveProgress = c.progressFinal;
  }

  res.json({ challenge: c });
});

// POST /api/challenges/:id/accept
router.post('/:id/accept', authenticateStudent, validateChallengeAccess, async (req, res) => {
  const challenge = req.challenge;

  if (global.isOfflineMode) {
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not in pending state.' });
    }
    const challenger = global.offlineStudents.find(s => String(s._id) === String(challenge.challengerId));
    if (!challenger || challenger.status === 'excused') {
      return res.status(404).json({ error: 'Challenger student is no longer active.' });
    }
    const opponentLockedSp = await getLockedSp(req.student._id);
    const opponentAvailableSp = req.student.totalSp - opponentLockedSp;
    if (opponentAvailableSp < challenge.betAmount) {
      return res.status(400).json({ error: `You only have ${opponentAvailableSp} available SP (requires ${challenge.betAmount} SP).` });
    }
    const challengerLockedSp = await getLockedSp(challenger._id);
    const challengerAvailableSp = challenger.totalSp - challengerLockedSp;
    if (challengerAvailableSp < challenge.betAmount) {
      return res.status(400).json({ error: 'Challenger no longer has enough available SP.' });
    }

    const startAt = new Date();
    const durationDays = 3;
    const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    challenge.status = 'active';
    challenge.respondedAt = startAt;
    challenge.startAt = startAt;
    challenge.endAt = endAt;
    challenge.escrow = {
      challengerLocked: challenge.betAmount,
      opponentLocked: challenge.betAmount
    };
    challenge.progressSnapshot = {
      challenger: getSimulatedProgress(challenge._id, challenge.challengerId, challenge.topic, 0),
      opponent: getSimulatedProgress(challenge._id, challenge.opponentId, challenge.topic, 0)
    };
    challenge.topicRef.windowStart = startAt;
    challenge.topicRef.windowEnd = endAt;
    challenge.auditTrail.push({
      actor: req.student.name,
      action: 'accept',
      detail: `Challenge accepted. Running window: ${startAt.toLocaleString()} to ${endAt.toLocaleString()}`
    });

    if (challenge.save) await challenge.save();
    return res.json({ challenge });
  }

  if (challenge.status !== 'pending') {
    return res.status(400).json({ error: 'Challenge is not in pending state.' });
  }

  if (new Date() > challenge.respondTimeoutAt) {
    challenge.status = 'expired';
    challenge.auditTrail.push({
      actor: 'system',
      action: 'expire',
      detail: 'Auto-expired due to respondent timeout.'
    });
    await challenge.save();
    return res.status(400).json({ error: 'Challenge has expired.' });
  }

  if (String(challenge.opponentId) !== String(req.student._id)) {
    return res.status(403).json({ error: 'Only the recipient can accept this challenge.' });
  }

  try {
    const challenger = await Student.findById(challenge.challengerId);
    if (!challenger || challenger.status === 'excused') {
      return res.status(404).json({ error: 'Challenger student is no longer active.' });
    }

    // 1. Double check opponent available SP
    const opponentLockedSp = await getLockedSp(req.student._id);
    const opponentAvailableSp = req.student.totalSp - opponentLockedSp;
    if (opponentAvailableSp < challenge.betAmount) {
      return res.status(400).json({ error: `You only have ${opponentAvailableSp} available SP (requires ${challenge.betAmount} SP).` });
    }

    // 2. Double check challenger available SP
    const challengerLockedSp = await getLockedSp(challenger._id);
    const challengerAvailableSp = challenger.totalSp - challengerLockedSp;
    if (challengerAvailableSp < challenge.betAmount) {
      return res.status(400).json({ error: 'Challenger no longer has enough available SP.' });
    }

    // 3. Mark challenge as active
    const startAt = new Date();
    // Reconstruct duration days from topicRef windowEnd setting
    const diffTime = Math.abs(challenge.topicRef.windowEnd - challenge.topicRef.windowStart);
    const durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 3;
    const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    challenge.status = 'active';
    challenge.respondedAt = startAt;
    challenge.startAt = startAt;
    challenge.endAt = endAt;
    challenge.escrow.challengerLocked = challenge.betAmount;
    challenge.escrow.opponentLocked = challenge.betAmount;

    // Snapshot initial simulated progress (usually very close to startVal)
    challenge.progressSnapshot = {
      challenger: getSimulatedProgress(challenge._id, challenge.challengerId, challenge.topic, 0),
      opponent: getSimulatedProgress(challenge._id, challenge.opponentId, challenge.topic, 0)
    };

    challenge.topicRef.windowStart = startAt;
    challenge.topicRef.windowEnd = endAt;

    challenge.auditTrail.push({
      actor: req.student.name,
      action: 'accept',
      detail: `Challenge accepted. Running window: ${startAt.toLocaleString()} to ${endAt.toLocaleString()}`
    });

    await challenge.save();
    res.json({ challenge });
  } catch (err) {
    console.error('accept challenge error:', err.message);
    res.status(500).json({ error: 'Failed to accept challenge.' });
  }
});

// POST /api/challenges/:id/decline
router.post('/:id/decline', authenticateStudent, validateChallengeAccess, async (req, res) => {
  const challenge = req.challenge;

  if (global.isOfflineMode) {
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not in pending state.' });
    }
    challenge.status = 'declined';
    challenge.respondedAt = new Date();
    challenge.auditTrail.push({
      actor: req.student.name,
      action: 'decline',
      detail: 'Declined the challenge invitation.'
    });
    if (challenge.save) await challenge.save();
    return res.json({ challenge });
  }

  if (challenge.status !== 'pending') {
    return res.status(400).json({ error: 'Challenge is not in pending state.' });
  }

  if (String(challenge.opponentId) !== String(req.student._id)) {
    return res.status(403).json({ error: 'Only the recipient can decline this challenge.' });
  }

  try {
    challenge.status = 'declined';
    challenge.respondedAt = new Date();
    challenge.auditTrail.push({
      actor: req.student.name,
      action: 'decline',
      detail: 'Declined the challenge invitation.'
    });
    await challenge.save();
    res.json({ challenge });
  } catch (err) {
    console.error('decline challenge error:', err.message);
    res.status(500).json({ error: 'Failed to decline challenge.' });
  }
});

// POST /api/challenges/:id/cancel
router.post('/:id/cancel', authenticateStudent, validateChallengeAccess, async (req, res) => {
  const challenge = req.challenge;

  if (global.isOfflineMode) {
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not in pending state.' });
    }
    challenge.status = 'cancelled';
    challenge.auditTrail.push({
      actor: req.student.name,
      action: 'cancel',
      detail: 'Cancelled the challenge request.'
    });
    if (challenge.save) await challenge.save();
    return res.json({ challenge });
  }

  if (challenge.status !== 'pending') {
    return res.status(400).json({ error: 'Challenge is not in pending state.' });
  }

  if (String(challenge.challengerId) !== String(req.student._id)) {
    return res.status(403).json({ error: 'Only the challenger can cancel this challenge.' });
  }

  try {
    challenge.status = 'cancelled';
    challenge.auditTrail.push({
      actor: req.student.name,
      action: 'cancel',
      detail: 'Cancelled the challenge request.'
    });
    await challenge.save();
    res.json({ challenge });
  } catch (err) {
    console.error('cancel challenge error:', err.message);
    res.status(500).json({ error: 'Failed to cancel challenge.' });
  }
});

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

// Admin headers validation helper
function isAdmin(req) {
  const email = req.headers['x-admin-email'];
  const token = req.headers['x-admin-token'];
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ? String(process.env.ADMIN_EMAIL).trim().toLowerCase() : null;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

  if (!ADMIN_EMAIL || !ADMIN_TOKEN || !email || !token) return false;
  return String(email).trim().toLowerCase() === ADMIN_EMAIL && String(token) === ADMIN_TOKEN;
}

function adminGuard(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// GET /api/admin/challenges
router.get('/admin/list', adminGuard, async (req, res) => {
  const { status, topic } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (topic) filter.topic = topic;

  try {
    const list = await Challenge.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ challenges: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin list.' });
  }
});

// POST /api/admin/challenges/:id/settle
router.post('/admin/:id/settle', adminGuard, async (req, res) => {
  const { id } = req.params;
  const { winnerId, resultReason } = req.body;

  if (!winnerId) {
    return res.status(400).json({ error: 'winnerId is required (or "void").' });
  }

  try {
    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found.' });
    }

    if (challenge.status !== 'active') {
      return res.status(400).json({ error: 'Only active challenges can be manually settled.' });
    }

    // Run final progress simulation to record final values
    challenge.progressFinal = {
      challenger: getSimulatedProgress(challenge._id, challenge.challengerId, challenge.topic, 1),
      opponent: getSimulatedProgress(challenge._id, challenge.opponentId, challenge.topic, 1)
    };

    if (winnerId === 'void') {
      await settleChallenge(challenge, 'void', resultReason || 'Admin manually voided the challenge.', 'admin');
    } else {
      const outcome = String(winnerId) === String(challenge.challengerId) ? 'challenger' : 'opponent';
      await settleChallenge(challenge, outcome, resultReason || 'Admin manual override settlement.', 'admin');
    }

    res.json({ challenge });
  } catch (err) {
    console.error('admin settle challenge error:', err.message);
    res.status(500).json({ error: 'Admin settlement failed.' });
  }
});

// POST /api/admin/challenges/:id/void
router.post('/admin/:id/void', adminGuard, async (req, res) => {
  const { id } = req.params;
  try {
    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found.' });
    }

    if (['completed', 'expired', 'declined', 'cancelled', 'void'].includes(challenge.status)) {
      return res.status(400).json({ error: 'Challenge is already resolved.' });
    }

    await settleChallenge(challenge, 'void', 'Admin manually voided.', 'admin');
    res.json({ challenge });
  } catch (err) {
    console.error('admin void challenge error:', err.message);
    res.status(500).json({ error: 'Admin void failed.' });
  }
});

export default router;
