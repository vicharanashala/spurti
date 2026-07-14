import express from 'express';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import FlexibleDayRequest from '../models/FlexibleDayRequest.js';
import {
  getNextUpcomingSession,
  isWithinBlackoutPeriod,
  isRequestWindowOpen
} from '../services/flexibleDayService.js';

const router = express.Router();

// Student auth middleware
async function requireStudent(req, res, next) {
  try {
    if (req.student) return next();
    
    // Check header or cookies
    const emailHeader = req.headers['x-student-email'] || req.headers['x-user-email'];
    let email = emailHeader ? String(emailHeader).trim().toLowerCase() : null;

    if (!email && req.headers.cookie) {
      const cookies = Object.fromEntries(
        req.headers.cookie.split(';').map(part => {
          const idx = part.indexOf('=');
          if (idx < 0) return null;
          return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
        }).filter(Boolean)
      );
      if (cookies.chatengine_token && process.env.SAMAGAMA_AUTH_URL) {
        try {
          const authRes = await fetch(process.env.SAMAGAMA_AUTH_URL, {
            headers: { cookie: `chatengine_token=${cookies.chatengine_token}` },
            signal: AbortSignal.timeout(3000)
          });
          if (authRes.ok) {
            const data = await authRes.json();
            email = (data?.user?.email || data?.email || '').toLowerCase().trim();
          }
        } catch {
          // ignore auth fetch failure in middleware
        }
      }
    }

    if (!email && req.query?.email) {
      email = String(req.query.email).trim().toLowerCase();
    }

    if (!email) {
      return res.status(401).json({ error: 'Unauthorized: Student authentication required' });
    }

    const student = await Student.findOne({
      $or: [{ email }, { alternateEmail: email }]
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    req.student = student;
    next();
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Authentication error' });
  }
}

router.use(requireStudent);

/**
 * 1. GET /api/student/flexible-day/eligibility
 */
router.get('/flexible-day/eligibility', async (req, res) => {
  try {
    const student = req.student;

    const usedCount = await FlexibleDayRequest.getUsedCount(student._id);
    const nextSession = await getNextUpcomingSession(student.cohortId);
    const isBlackout = isWithinBlackoutPeriod(student.internshipEndDate);
    const windowOpen = nextSession ? isRequestWindowOpen(nextSession.startDateTime) : false;

    let eligible = true;
    let reason = null;

    // Check rules in exact order:
    // 1. totalSp >= 300 (BR-01)
    if (student.totalSp < 300) {
      eligible = false;
      reason = `Insufficient SP (need 300, have ${student.totalSp})`;
    }
    // 2. usedCount < 2 (BR-03)
    else if (usedCount >= 2) {
      eligible = false;
      reason = 'No requests remaining';
    }
    // 3. nextSession exists (BR-06)
    else if (!nextSession) {
      eligible = false;
      reason = 'No upcoming sessions';
    }
    // 4. not in blackout period (BR-05)
    else if (isBlackout) {
      eligible = false;
      reason = 'Final week — flexible days unavailable';
    }
    // 5. request window open (BR-04)
    else if (!windowOpen) {
      eligible = false;
      reason = 'Request window closed for this session';
    }

    const remainingRequests = Math.max(0, 2 - usedCount);
    const requestWindowClosesAt = nextSession
      ? new Date(new Date(nextSession.startDateTime).getTime() - 3 * 60 * 60 * 1000).toISOString()
      : null;

    res.json({
      eligible,
      reason,
      remainingRequests,
      nextSession: nextSession ? {
        _id: nextSession._id,
        label: nextSession.label,
        date: nextSession.date || nextSession.startDateTime,
        startDateTime: nextSession.startDateTime
      } : null,
      requestWindowOpen: windowOpen,
      requestWindowClosesAt,
      isBlackoutPeriod: isBlackout,
      blackoutStartDate: student.internshipEndDate ? new Date(student.internshipEndDate).toISOString() : null,
      currentBalance: student.totalSp,
      minimumRequired: 300,
      cost: 140
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Server error checking eligibility' });
  }
});

/**
 * 2. POST /api/student/flexible-day/request
 */
router.post('/flexible-day/request', async (req, res) => {
  try {
    const { disclaimerAccepted } = req.body || {};
    if (disclaimerAccepted !== true) {
      return res.status(400).json({ error: 'Disclaimer must be accepted' });
    }

    const student = req.student;

    // Re-run all 5 eligibility checks in order
    // 1. totalSp >= 300
    if (student.totalSp < 300) {
      return res.status(400).json({ error: `Insufficient SP (need 300, have ${student.totalSp})` });
    }

    // 2. usedCount < 2
    const usedCount = await FlexibleDayRequest.getUsedCount(student._id);
    if (usedCount >= 2) {
      return res.status(400).json({ error: 'No requests remaining' });
    }

    // 3. nextSession exists
    const nextSession = await getNextUpcomingSession(student.cohortId);
    if (!nextSession) {
      return res.status(400).json({ error: 'No upcoming sessions' });
    }

    // 4. not in blackout period
    const isBlackout = isWithinBlackoutPeriod(student.internshipEndDate);
    if (isBlackout) {
      return res.status(400).json({ error: 'Final week — flexible days unavailable' });
    }

    // 5. request window open
    const windowOpen = isRequestWindowOpen(nextSession.startDateTime);
    if (!windowOpen) {
      return res.status(400).json({ error: 'Request window closed for this session' });
    }

    // Check no PENDING request already exists for this student
    const existingPending = await FlexibleDayRequest.findOne({
      studentId: student._id,
      status: 'PENDING'
    });
    if (existingPending) {
      return res.status(400).json({ error: 'A pending flexible day request already exists' });
    }

    let instructorId = nextSession.instructorId;
    if (!instructorId || !mongoose.Types.ObjectId.isValid(instructorId)) {
      const cohort = await mongoose.model('Cohort').findById(student.cohortId);
      if (cohort && cohort.instructorId) {
        instructorId = cohort.instructorId;
      }
    }
    if (!instructorId || !mongoose.Types.ObjectId.isValid(instructorId)) {
      const fallbackInstructor = await mongoose.model('Instructor').findOne({ isActive: true });
      if (fallbackInstructor) {
        instructorId = fallbackInstructor._id;
      } else {
        instructorId = new mongoose.Types.ObjectId();
      }
    }

    const now = new Date();
    const newRequest = await FlexibleDayRequest.create({
      studentId: student._id,
      sessionId: nextSession._id,
      sessionLabel: nextSession.label,
      sessionDate: nextSession.date || nextSession.startDateTime,
      status: 'PENDING',
      disclaimerAccepted: true,
      disclaimerAcceptedAt: now,
      requestedAt: now,
      instructorId
    });

    // Create notification for instructor
    try {
      const notificationsCollection = mongoose.connection.collection('notifications');
      await notificationsCollection.insertOne({
        recipientId: instructorId,
        type: 'FLEXIBLE_DAY_REQUEST',
        payload: {
          studentId: student._id,
          studentName: student.name,
          sessionLabel: nextSession.label,
          sessionDate: nextSession.date || nextSession.startDateTime,
          requestId: newRequest._id,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
        },
        createdAt: now
      });
    } catch {
      // Best-effort notification insertion
    }

    res.status(201).json(newRequest);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to submit flexible day request' });
  }
});

/**
 * 3. GET /api/student/flexible-day/history
 */
router.get('/flexible-day/history', async (req, res) => {
  try {
    const student = req.student;
    const requests = await FlexibleDayRequest.find({ studentId: student._id })
      .sort({ requestedAt: -1 })
      .lean();

    const history = requests.map(r => ({
      requestId: r._id,
      sessionLabel: r.sessionLabel,
      sessionDate: r.sessionDate,
      status: r.status,
      requestedAt: r.requestedAt,
      respondedAt: r.respondedAt,
      instructorNote: r.instructorNote,
      spDeducted: r.spDeducted
    }));

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to fetch request history' });
  }
});

export default router;
