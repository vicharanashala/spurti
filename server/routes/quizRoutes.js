import express from 'express';
import Student from '../models/Student.js';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import SPTransaction from '../models/SPTransaction.js';
import { SAMAGAMA_AUTH_URL, ALLOW_STUDENT_SEARCH } from '../config.js';
import { calculateSpPoints, applyQuizPoints } from '../services/quiz/pointsEngine.js';
import { scheduleQuizForSession, checkAndSendNotifications } from '../services/quiz/quizScheduler.js';
import Session from '../models/Session.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

async function getSamagamaUser(chatengineToken) {
  if (!chatengineToken) return null;
  try {
    const res = await fetch(SAMAGAMA_AUTH_URL, {
      headers: { cookie: `chatengine_token=${chatengineToken}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function studentEmailFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const data = await getSamagamaUser(cookies.chatengine_token);
  const email = data?.user?.email || data?.email;
  if (email) return normalizeEmail(email);

  // Fallback for local testing / development if ALLOW_STUDENT_SEARCH is enabled
  if (ALLOW_STUDENT_SEARCH && req.headers['x-test-email']) {
    return normalizeEmail(req.headers['x-test-email']);
  }
  return null;
}

async function getStudentFromRequest(req) {
  const email = await studentEmailFromRequest(req);
  if (!email) return null;
  return await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
}

// Helper to check admin token
function isAdmin(req) {
  const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in');
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin';
  const emailOk = normalizeEmail(req.headers['x-admin-email']) === ADMIN_EMAIL;
  const tokenOk = String(req.headers['x-admin-token'] || '') === ADMIN_TOKEN;
  return emailOk && tokenOk;
}

function adminGuard(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// 1. Get the current active quiz (if any)
router.get('/current', async (req, res) => {
  try {
    const student = await getStudentFromRequest(req);
    if (!student) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    // Find quiz currently active
    const quiz = await Quiz.findOne({
      startTime: { $lte: now }
    }).sort({ startTime: -1 }).lean();

    if (!quiz) {
      return res.status(404).json({ message: 'No active quiz found' });
    }

    const quizEnd = new Date(quiz.startTime.getTime() + quiz.durationMinutes * 60 * 1000);
    const isActive = now >= quiz.startTime && now <= quizEnd;

    if (!isActive) {
      return res.status(404).json({ message: 'No active quiz found' });
    }

    // Check if student already attempted
    const attempt = await QuizAttempt.findOne({ studentId: student._id, quizId: quiz._id }).lean();

    // Map questions to strip correct answer index and explanation for security if not attempted
    const questionsToShow = attempt 
      ? quiz.questions 
      : quiz.questions.map(q => ({
          question: q.question,
          options: q.options
        }));

    res.json({
      quizId: quiz._id,
      sessionLabel: quiz.sessionLabel,
      startTime: quiz.startTime,
      endTime: quizEnd,
      durationMinutes: quiz.durationMinutes,
      alreadyAttempted: !!attempt,
      attemptDetails: attempt ? {
        score: attempt.score,
        appliedDelta: attempt.appliedDelta,
        answers: attempt.answers
      } : null,
      questions: questionsToShow
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Submit answers for a quiz
router.post('/submit', async (req, res) => {
  try {
    const student = await getStudentFromRequest(req);
    if (!student) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quizId, answers } = req.body;
    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'quizId and answers array are required' });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Verify time limit (with 30s grace period)
    const now = new Date();
    const quizEnd = new Date(quiz.startTime.getTime() + (quiz.durationMinutes * 60 + 30) * 1000);
    if (now < quiz.startTime || now > quizEnd) {
      return res.status(400).json({ error: 'Quiz is not active or has ended' });
    }

    // Verify array length
    if (answers.length !== quiz.questions.length) {
      return res.status(400).json({ error: `Must submit answers for exactly ${quiz.questions.length} questions` });
    }

    // Check if already attempted
    const existing = await QuizAttempt.findOne({ studentId: student._id, quizId: quiz._id });
    if (existing) {
      return res.status(400).json({ error: 'Quiz already attempted' });
    }

    // Calculate score
    let score = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (answers[i] === quiz.questions[i].correctAnswerIndex) {
        score++;
      }
    }

    // Apply SP points
    const txn = await applyQuizPoints(student._id, quiz, score);

    // Save attempt
    const attempt = await QuizAttempt.create({
      email: student.email,
      studentId: student._id,
      quizId: quiz._id,
      score,
      answers,
      appliedDelta: calculateSpPoints(score),
      transactionId: txn?._id || null
    });

    res.json({
      message: 'Quiz submitted successfully',
      score,
      totalQuestions: quiz.questions.length,
      appliedDelta: attempt.appliedDelta,
      questions: quiz.questions // Send full questions with explanations back upon submission
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get quiz status (e.g. active, upcoming, completed)
router.get('/status', async (req, res) => {
  try {
    const student = await getStudentFromRequest(req);
    if (!student) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    
    // Find latest scheduled quiz
    const latestQuiz = await Quiz.findOne().sort({ startTime: -1 }).lean();
    if (!latestQuiz) {
      return res.json({ status: 'no_quizzes' });
    }

    const quizEnd = new Date(latestQuiz.startTime.getTime() + latestQuiz.durationMinutes * 60 * 1000);
    const isActive = now >= latestQuiz.startTime && now <= quizEnd;
    const isUpcoming = now < latestQuiz.startTime;

    const attempt = await QuizAttempt.findOne({ studentId: student._id, quizId: latestQuiz._id }).lean();

    res.json({
      latestQuiz: {
        _id: latestQuiz._id,
        sessionLabel: latestQuiz.sessionLabel,
        startTime: latestQuiz.startTime,
        endTime: quizEnd,
        isUpcoming,
        isActive
      },
      attempted: !!attempt,
      score: attempt ? attempt.score : null,
      appliedDelta: attempt ? attempt.appliedDelta : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Route: Force schedule a quiz for a morning session
router.post('/admin/schedule', adminGuard, async (req, res) => {
  try {
    const { sessionLabel } = req.body;
    if (!sessionLabel) {
      return res.status(400).json({ error: 'sessionLabel is required' });
    }

    const session = await Session.findOne({ label: sessionLabel });
    if (!session) {
      return res.status(404).json({ error: `Session "${sessionLabel}" not found` });
    }

    const quiz = await scheduleQuizForSession(session);
    if (!quiz) {
      return res.status(400).json({ error: 'Failed to schedule quiz (e.g. not a morning session)' });
    }

    res.json({ message: 'Quiz scheduled successfully', quiz });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Route: Force trigger notification checks
router.post('/admin/check-notifications', adminGuard, async (req, res) => {
  try {
    await checkAndSendNotifications();
    res.json({ message: 'Notification check triggered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
