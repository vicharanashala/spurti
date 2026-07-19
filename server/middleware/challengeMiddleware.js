/**
 * middleware/challengeMiddleware.js
 *
 * Middleware functions for the Peer Challenge routes:
 *   authenticateStudent     — verifies Samagama cookie, attaches req.student
 *   validateChallengeAccess — confirms req.student is a participant in :id challenge
 *   checkActiveLimit        — rejects if student already has 3 active/pending challenges
 */

import mongoose from 'mongoose';
import { getStudentFromRequest } from './auth.js';
import Challenge from '../models/Challenge.js';

// ─── 1. authenticateStudent ───────────────────────────────────────────────────
export async function authenticateStudent(req, res, next) {
  // DEV ONLY — bypass Samagama auth in non-production environments when the
  // client signals it with the X-Dev-Bypass header. Never active in production.
  if (
    process.env.NODE_ENV !== 'production' &&
    req.headers['x-dev-bypass'] === 'true'
  ) {
    req.student = {
      _id: new mongoose.Types.ObjectId('000000000000000000000001'),
      id: '000000000000000000000001',
      name: 'Dev User',
      email: 'dev@localhost',
      status: 'active',
      totalSp: 50,
      save: async () => { }
    };
    return next();
  }

  try {
    const student = await getStudentFromRequest(req);

    if (!student) {
      return res.status(401).json({
        error: 'Authentication required. Please log in via Samagama.',
        code: 'UNAUTHENTICATED'
      });
    }

    if (student.status === 'excused') {
      return res.status(403).json({
        error: 'Your account has been excused and cannot participate in challenges.',
        code: 'STUDENT_EXCUSED'
      });
    }

    req.student = student;
    next();
  } catch (err) {
    console.error('[authenticateStudent] Error:', err.message);
    res.status(500).json({
      error: 'Authentication check failed. Please try again.',
      code: 'AUTH_ERROR'
    });
  }
}

// ─── 2. validateChallengeAccess ──────────────────────────────────────────────
export async function validateChallengeAccess(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: 'Challenge not found.',
        code: 'CHALLENGE_NOT_FOUND'
      });
    }

    const challenge = await Challenge.findById(id);

    if (!challenge) {
      return res.status(404).json({
        error: 'Challenge not found.',
        code: 'CHALLENGE_NOT_FOUND'
      });
    }

    const myId = String(req.student._id);
    const isChallenger = String(challenge.challengerId) === myId;
    const isOpponent = String(challenge.opponentId) === myId;

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({
        error: 'You are not a participant in this challenge.',
        code: 'NOT_A_PARTICIPANT'
      });
    }

    req.challenge = challenge;
    next();
  } catch (err) {
    console.error('[validateChallengeAccess] Error:', err.message);
    res.status(500).json({
      error: 'Could not verify challenge access. Please try again.',
      code: 'ACCESS_CHECK_ERROR'
    });
  }
}

// ─── 3. checkActiveLimit ─────────────────────────────────────────────────────
export async function checkActiveLimit(req, res, next) {
  try {
    const studentId = req.student._id;
    // Count active or pending challenges where the student is challenger or opponent
    const count = await Challenge.countDocuments({
      status: { $in: ['pending', 'active'] },
      $or: [
        { challengerId: studentId },
        { opponentId: studentId }
      ]
    });

    if (count >= 3) {
      return res.status(400).json({
        error: 'You already have 3 active or pending challenges. Resolve an existing challenge before issuing a new one.',
        code: 'CHALLENGER_LIMIT_REACHED'
      });
    }

    next();
  } catch (err) {
    console.error('[checkActiveLimit] Error:', err.message);
    res.status(500).json({
      error: 'Could not check your active challenge count. Please try again.',
      code: 'LIMIT_CHECK_ERROR'
    });
  }
}
