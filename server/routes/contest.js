import express from 'express';
import Contest from '../models/Contest.js';
import ContestAttempt from '../models/ContestAttempt.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AIConfig from '../models/AIConfig.js';
import { generateQuestions as aiGenerateQuestions } from '../services/aiProvider.js';
import { recalculateStudentSp } from '../scripts/lib/ingestion.js';

const router = express.Router();

// ═══════════════════════════════════════════
// GUARDS
// ═══════════════════════════════════════════

// In-memory rate limiter for contest submissions (token bucket per IP+email).
// Prevents brute-force of MCQ answers when maxAttempts is high or unset.
const submitBuckets = new Map(); // key -> { tokens, lastRefill }
const SUBMIT_LIMIT = 5;          // max submissions per window
const SUBMIT_WINDOW_MS = 60_000; // 1 minute window

function submitRateLimit(req, res, next) {
  const email = (req.headers['x-student-email'] || '').toLowerCase();
  const key = `${req.ip}|${email}`;
  const now = Date.now();
  const bucket = submitBuckets.get(key) || { tokens: SUBMIT_LIMIT, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / SUBMIT_WINDOW_MS) * SUBMIT_LIMIT;
  if (refill > 0) {
    bucket.tokens = Math.min(SUBMIT_LIMIT, bucket.tokens + refill);
    bucket.lastRefill = now;
  }
  if (bucket.tokens <= 0) {
    return res.status(429).json({ error: 'Too many submissions. Please slow down and try again in a minute.' });
  }
  bucket.tokens -= 1;
  submitBuckets.set(key, bucket);
  next();
}

function adminGuard(req, res, next) {
  const adminEmail = req.headers['x-admin-email'];
  const adminToken = req.headers['x-admin-token'];
  // Also check if adminToken matches the process.env.ADMIN_TOKEN or default
  const expectedToken = process.env.ADMIN_TOKEN || 'vled-local-admin';
  if (!adminEmail || adminToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function studentGuard(req, res, next) {
  // Cookie-derived email (set by the cookieMiddleware in server.js) is
  // AUTHORITATIVE. If a cookie is present, its email overrides any header
  // to prevent one student from spoofing another via x-student-email.
  // Header-only auth is still accepted as a backwards-compat fallback for
  // callers that don't yet carry a cookie (e.g. legacy scripts), but the
  // moment a verified cookie exists, the cookie wins.
  let email;
  if (req.spurtiStudent?.email) {
    email = req.spurtiStudent.email;
  } else {
    email = req.headers['x-student-email'];
  }
  if (!email) {
    return res.status(401).json({ error: 'Not authenticated as student' });
  }
  req.headers['x-student-email'] = String(email).toLowerCase(); // normalize for downstream handlers
  next();
}

// ═══════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════

// GET /admin/contests - List all contests
router.get('/admin/contests', adminGuard, async (req, res) => {
  try {
    const contests = await Contest.find().sort({ createdAt: -1 }).lean();
    res.json(contests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/contests - Save a new contest
router.post('/admin/contests', adminGuard, async (req, res) => {
  try {
    const contest = await Contest.create(req.body);
    res.json(contest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/contests/:id - Update an existing contest
router.put('/admin/contests/:id', adminGuard, async (req, res) => {
  try {
    const updated = await Contest.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!updated) return res.status(404).json({ error: 'Contest not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/contests/:id/toggle - Toggle active status of a contest
router.post('/admin/contests/:id/toggle', adminGuard, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    contest.isActive = !contest.isActive;
    await contest.save();
    res.json(contest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/contests/:id/stats - Get statistics for a contest
router.get('/admin/contests/:id/stats', adminGuard, async (req, res) => {
  try {
    const contestId = req.params.id;
    const contest = await Contest.findById(contestId).lean();
    if (!contest) return res.status(404).json({ error: 'Contest not found' });

    const attempts = await ContestAttempt.find({ contestId }).sort({ completedAt: -1 }).lean();
    const uniqueEmails = new Set(attempts.map(a => a.studentEmail));
    const passedAttempts = attempts.filter(a => a.passed);
    const uniquePassed = new Set(passedAttempts.map(a => a.studentEmail));

    const totalParticipants = uniqueEmails.size;
    const totalPassed = uniquePassed.size;
    const passRate = totalParticipants ? Math.round((totalPassed / totalParticipants) * 100) : 0;

    let averageScore = 0;
    if (attempts.length > 0) {
      averageScore = Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length);
    }

    res.json({
      contest,
      stats: {
        totalAttempts: attempts.length,
        totalParticipants,
        totalPassed,
        passRate,
        averageScore
      },
      attempts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/contests/create-from-transcript - Generate a draft contest from transcript
// Tries AI generation if AIConfig is enabled and has a key, otherwise falls back
// to the original rule-based template (preserved below for parity).
router.post('/admin/contests/create-from-transcript', adminGuard, async (req, res) => {
  try {
    const { transcript, contestName, count, difficulty, topicHint, useAi } = req.body || {};
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

    const wantsAi = useAi !== false; // default true
    let aiSource = null;
    let aiError = null;

    if (wantsAi) {
      try {
        const cfg = await AIConfig.findOne({ singleton: 'global' }).lean();
        if (cfg?.isEnabled) {
          const result = await aiGenerateQuestions({
            transcript,
            count: count || cfg.defaults?.questionCount || 5,
            difficulty: difficulty || cfg.defaults?.difficulty || 'medium',
            topicHint
          });
          aiSource = result;
        }
      } catch (err) {
        aiError = err;
        // Fall through to the rule-based generator below.
      }
    }

    if (aiSource) {
      return res.json({
        name: contestName || 'New AI-Generated Contest',
        description: 'Generated by your configured AI provider. Review each question before activating.',
        transcript,
        scrambledWords: aiSource.scrambledWords,
        questions: aiSource.questions,
        threshold: 60,
        spReward: 15,
        reflectionPrompt: 'What was your main takeaway from this session, and how do you plan to apply it?',
        reflectionSpBonus: 5,
        maxAttempts: 3,
        isActive: false,
        _aiMeta: {
          provider: aiSource.provider,
          model: aiSource.model,
          tokensUsed: aiSource.tokensUsed
        }
      });
    }

    // ── Rule-based fallback (unchanged from the original implementation) ──
    // If AI was attempted but failed, surface that on the response so the admin UI
    // can warn them; the body still returns a usable draft.
    // 1. Keyword extraction (Heuristic)
    // Filter words and find common long words (concepts) for scrambled words
    const words = transcript
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 5);

    const counts = {};
    for (const w of words) counts[w] = (counts[w] || 0) + 1;

    // Filter out common english filler words
    const fillers = new Set(['about', 'before', 'should', 'through', 'would', 'people', 'session', 'intern', 'meeting', 'transcript']);
    const sortedWords = Object.keys(counts)
      .filter(w => !fillers.has(w))
      .sort((a, b) => counts[b] - counts[a]);

    const scrambledWords = sortedWords.slice(0, 4).map(w => w.toUpperCase());

    // Fallback if transcript was too short
    while (scrambledWords.length < 3) {
      scrambledWords.push(['SPURTI', 'ENERGY', 'COHORT', 'SESSION'][scrambledWords.length]);
    }

    // 2. Mock Question Generation (Rule-based templates)
    const questions = [
      {
        question: `Which of the following topics appears to be a core subject of discussion in "${contestName || 'this session'}"?`,
        options: [
          scrambledWords[0] ? scrambledWords[0].charAt(0) + scrambledWords[0].slice(1).toLowerCase() : 'Technical Development',
          'Database Administration',
          'Marketing Optimization',
          'Graphic Design Basics'
        ],
        correctAnswer: 0,
        timeLimit: 20
      },
      {
        question: `Based on the session transcript, why is the concept of "${scrambledWords[1] ? scrambledWords[1].toLowerCase() : 'regular practice'}" critical to success?`,
        options: [
          'It is a compliance checklist only.',
          'It reinforces continuous improvement and retention.',
          'It reduces total working hours required.',
          'It has no direct correlation to outcomes.'
        ],
        correctAnswer: 1,
        timeLimit: 20
      },
      {
        question: `What primary challenge or obstacle did the speaker address during the session?`,
        options: [
          'Unexplained server downtime.',
          'Lack of consistent engagement and motivation.',
          'Incorrect user credentials.',
          'Low bandwidth connection issues.'
        ],
        correctAnswer: 1,
        timeLimit: 20
      },
      {
        question: `What key takeaway or action item was recommended at the end of the meeting?`,
        options: [
          'Stop logging into the dashboard.',
          'Postponing all milestones indefinitely.',
          'Review the session summary and complete the follow-up tasks.',
          'Send emails directly to the director.'
        ],
        correctAnswer: 2,
        timeLimit: 20
      },
      {
        question: `Which indicator shows that an intern is maintaining high Spurti standing?`,
        options: [
          'High attendance, poll participation, and useful contributions.',
          'Having a large team size.',
          'Submitting tasks early regardless of quality.',
          'Asking the admin for manual adjustments.'
        ],
        correctAnswer: 0,
        timeLimit: 20
      }
    ];

    res.json({
      name: contestName || 'New Zoom Session Contest',
      description: 'Review the session details, unscramble keywords, and test your knowledge of what was discussed.',
      transcript,
      scrambledWords,
      questions,
      threshold: 60,
      spReward: 15,
      reflectionPrompt: 'What was your main takeaway from this session, and how do you plan to apply it?',
      reflectionSpBonus: 5,
      maxAttempts: 3,
      isActive: false,
      _aiFallbackReason: aiError ? {
        code: aiError.code || 'UNKNOWN',
        message: aiError.message
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/contests/ai-generate - AI-only generation. Skips fallback so the
// caller can distinguish "AI disabled / no key" from "AI succeeded".
router.post('/admin/contests/ai-generate', adminGuard, async (req, res) => {
  try {
    const { transcript, count, difficulty, topicHint } = req.body || {};
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

    const result = await aiGenerateQuestions({ transcript, count, difficulty, topicHint });
    res.json({
      scrambledWords: result.scrambledWords,
      questions: result.questions,
      tokensUsed: result.tokensUsed,
      provider: result.provider,
      model: result.model
    });
  } catch (err) {
    const status = err.code === 'NO_KEY' ? 400
      : err.code === 'AUTH_FAILED' ? 401
      : err.code === 'DISABLED' ? 409
      : err.code === 'CAP_EXCEEDED' ? 429
      : err.code === 'BAD_OUTPUT' || err.code === 'EMPTY_OUTPUT' ? 502
      : 500;
    res.status(status).json({ code: err.code || 'UNKNOWN', error: err.message });
  }
});

// ═══════════════════════════════════════════
// STUDENT ENDPOINTS
// ═══════════════════════════════════════════

// GET /active - List active contests for student
router.get('/active', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'].toLowerCase();

    const contests = await Contest.find({ isActive: true }).lean();
    const enriched = [];

    for (const c of contests) {
      const attempts = await ContestAttempt.find({ studentEmail: email, contestId: c._id }).sort({ attemptNumber: 1 }).lean();
      const hasPassed = attempts.some(a => a.passed);
      const attemptsCount = attempts.length;
      const bestScore = attemptsCount ? Math.max(...attempts.map(a => a.score)) : 0;
      const reflectionSubmitted = attempts.some(a => !!a.reflectionResponse);

      // Filter out correct answers to prevent student cheating
      const secureQuestions = c.questions.map(q => ({
        _id: q._id,
        question: q.question,
        options: q.options,
        timeLimit: q.timeLimit
      }));

      enriched.push({
        _id: c._id,
        name: c.name,
        description: c.description,
        transcript: c.transcript,
        scrambledWords: c.scrambledWords,
        questions: secureQuestions,
        reflectionPrompt: c.reflectionPrompt,
        reflectionSpBonus: c.reflectionSpBonus,
        threshold: c.threshold,
        spReward: c.spReward,
        maxAttempts: c.maxAttempts,
        isActive: c.isActive,
        startDate: c.startDate,
        endDate: c.endDate,
        // Student status
        attemptsCount,
        hasPassed,
        bestScore,
        reflectionSubmitted,
        attempts
      });
    }

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - Get a specific contest for a student (excluding answers)
router.get('/:id', studentGuard, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id).lean();
    if (!contest || !contest.isActive) return res.status(404).json({ error: 'Contest not found or inactive' });

    const email = req.headers['x-student-email'].toLowerCase();
    const attempts = await ContestAttempt.find({ studentEmail: email, contestId: contest._id }).lean();

    // Security: strip correct answers
    contest.questions = contest.questions.map(q => ({
      _id: q._id,
      question: q.question,
      options: q.options,
      timeLimit: q.timeLimit
    }));

    res.json({
      contest,
      attemptsCount: attempts.length,
      hasPassed: attempts.some(a => a.passed),
      attempts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/submit - Submit answers for a contest attempt
router.post('/:id/submit', studentGuard, submitRateLimit, async (req, res) => {
  try {
    const contestId = req.params.id;
    const email = req.headers['x-student-email'].toLowerCase();
    const { answers, reflectionResponse } = req.body;

    const contest = await Contest.findById(contestId);
    if (!contest || !contest.isActive) return res.status(404).json({ error: 'Contest not found or inactive' });

    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    // Verify attempt limit
    const pastAttempts = await ContestAttempt.find({ studentEmail: student.email, contestId });
    const attemptCount = pastAttempts.length;
    if (contest.maxAttempts > 0 && attemptCount >= contest.maxAttempts) {
      return res.status(403).json({ error: 'You have reached the maximum attempts allowed for this contest.' });
    }

    const alreadyPassed = pastAttempts.some(a => a.passed);

    // Calculate score
    let correctCount = 0;
    const totalQuestions = contest.questions.length;
    for (let i = 0; i < totalQuestions; i++) {
      if (answers[i] === contest.questions[i].correctAnswer) {
        correctCount++;
      }
    }

    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = score >= contest.threshold;

    // Check if reflection bonus should be awarded
    const alreadyReceivedReflection = pastAttempts.some(a => a.reflectionAwarded);
    const hasReflection = !!reflectionResponse && reflectionResponse.trim().length > 5;
    const awardReflection = hasReflection && !alreadyReceivedReflection && contest.reflectionSpBonus > 0;

    // Determine SP reward
    const awardPassSP = passed && !alreadyPassed && contest.spReward > 0;
    let earnedSp = 0;

    let passTx = null;
    let reflectionTx = null;
    const now = new Date();

    // Read the authoritative balance ONCE so back-to-back transactions
    // (pass + reflection) compute their balanceAfter consistently even if
    // a concurrent ingestion run lands between the two creates.
    const last = await SPTransaction.findOne({ email: student.email }).sort({ dateTime: -1, createdAt: -1 }).lean();
    let runningBalance = Number(last?.balanceAfter ?? student.totalSp ?? 0);

    if (awardPassSP) {
      earnedSp += contest.spReward;
      runningBalance += contest.spReward;
      passTx = await SPTransaction.create({
        email: student.email,
        studentId: student._id,
        category: 'contest',
        sessionLabel: contest.name,
        deltaMode: 'absolute',
        deltaValue: contest.spReward,
        appliedDelta: contest.spReward,
        balanceAfter: runningBalance,
        reason: `Contest "${contest.name}": passed quiz with score ${score}% (Threshold ${contest.threshold}%).`,
        dateTime: now
      });
    }

    if (awardReflection) {
      earnedSp += contest.reflectionSpBonus;
      runningBalance += contest.reflectionSpBonus;
      reflectionTx = await SPTransaction.create({
        email: student.email,
        studentId: student._id,
        category: 'contest_reflection',
        sessionLabel: contest.name,
        deltaMode: 'absolute',
        deltaValue: contest.reflectionSpBonus,
        appliedDelta: contest.reflectionSpBonus,
        balanceAfter: runningBalance,
        reason: `Contest "${contest.name}": reflection submission bonus.`,
        dateTime: now
      });
    }

    // Save attempt record
    const attempt = await ContestAttempt.create({
      studentEmail: student.email,
      studentName: student.name,
      contestId,
      attemptNumber: attemptCount + 1,
      answers,
      score,
      passed,
      reflectionResponse: reflectionResponse || '',
      reflectionAwarded: awardReflection,
      earnedSp,
      spTransactionId: passTx ? passTx._id : null,
      completedAt: now
    });

    // Recalculate SP if points were awarded
    if (earnedSp > 0) {
      await recalculateStudentSp(student.email);
    }

    res.json({
      attempt,
      correctAnswers: contest.questions.map(q => q.correctAnswer), // now that attempt is complete, return correct answers for feedback
      score,
      passed,
      earnedSp,
      awardReflection
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
