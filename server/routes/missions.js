import express from 'express';
import Mission from '../models/Mission.js';
import MissionAttempt from '../models/MissionAttempt.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import ContestAttempt from '../models/ContestAttempt.js';
import { recalculateStudentSp } from '../scripts/lib/ingestion.js';

const router = express.Router();

// ═══════════════════════════════════════════
// GUARDS
// ═══════════════════════════════════════════

function adminGuard(req, res, next) {
  const adminEmail = req.headers['x-admin-email'];
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_TOKEN || 'vled-local-admin';
  if (!adminEmail || adminToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function studentGuard(req, res, next) {
  let email;
  if (req.spurtiStudent?.email) {
    email = req.spurtiStudent.email;
  } else {
    email = req.headers['x-student-email'];
  }
  if (!email) {
    return res.status(401).json({ error: 'Not authenticated as student' });
  }
  req.headers['x-student-email'] = String(email).toLowerCase();
  next();
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const DURATION_DAYS = { '1d': 1, '3d': 3, '7d': 7, '30d': 30 };

function dueDate(startDate, duration) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + (DURATION_DAYS[duration] || 7));
  return d;
}

// Calculate streak: consecutive days (from the end) that have ≥1 completed task
function calcStreak(taskProgress) {
  if (!taskProgress || taskProgress.length === 0) return 0;
  const completedDays = new Set();
  for (const tp of taskProgress) {
    if (tp.completed && tp.completedAt) {
      completedDays.add(new Date(tp.completedAt).toISOString().slice(0, 10));
    }
  }
  if (completedDays.size === 0) return 0;

  const sorted = [...completedDays].sort().reverse();
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffMs = prev.getTime() - curr.getTime();
    if (diffMs <= 86400000 * 1.5) { // allow slight timezone drift
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ═══════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════

// GET /admin/missions — List all mission templates
router.get('/admin/missions', adminGuard, async (req, res) => {
  try {
    const missions = await Mission.find().sort({ createdAt: -1 }).lean();
    // Attach participant count for each
    const counts = await MissionAttempt.aggregate([
      { $group: { _id: '$missionId', count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
    const enriched = missions.map(m => ({ ...m, participantCount: countMap[String(m._id)] || 0 }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/missions — Create a new mission template
router.post('/admin/missions', adminGuard, async (req, res) => {
  try {
    const mission = await Mission.create(req.body);
    res.json(mission);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /admin/missions/:id — Update
router.put('/admin/missions/:id', adminGuard, async (req, res) => {
  try {
    const updated = await Mission.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!updated) return res.status(404).json({ error: 'Mission not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /admin/missions/:id/toggle — Activate/Deactivate
router.post('/admin/missions/:id/toggle', adminGuard, async (req, res) => {
  try {
    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    mission.isActive = !mission.isActive;
    await mission.save();
    res.json({ isActive: mission.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/missions/:id/stats — Per-mission stats
router.get('/admin/missions/:id/stats', adminGuard, async (req, res) => {
  try {
    const mission = await Mission.findById(req.params.id).lean();
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const attempts = await MissionAttempt.find({ missionId: req.params.id })
      .sort({ createdAt: -1 }).lean();

    const totalParticipants = new Set(attempts.map(a => a.studentEmail)).size;
    const completed = attempts.filter(a => a.status === 'completed');
    const active = attempts.filter(a => a.status === 'active');
    const failed = attempts.filter(a => a.status === 'failed');
    const abandoned = attempts.filter(a => a.status === 'abandoned');

    const avgStreak = attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.streak || 0), 0) / attempts.length * 10) / 10
      : 0;

    const completionRate = attempts.length > 0
      ? Math.round(completed.length / attempts.length * 100)
      : 0;

    const totalSpAwarded = completed.reduce((s, a) => s + (a.earnedSp || 0), 0);

    res.json({
      mission,
      stats: {
        totalParticipants,
        totalAttempts: attempts.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        abandoned: abandoned.length,
        completionRate,
        avgStreak,
        totalSpAwarded
      },
      attempts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/dashboard — Aggregate stats
router.get('/admin/dashboard', adminGuard, async (req, res) => {
  try {
    const [totalMissions, activeMissions, totalAttempts, completedAttempts] = await Promise.all([
      Mission.countDocuments(),
      Mission.countDocuments({ isActive: true }),
      MissionAttempt.countDocuments(),
      MissionAttempt.countDocuments({ status: 'completed' })
    ]);
    const completionRate = totalAttempts > 0 ? Math.round(completedAttempts / totalAttempts * 100) : 0;
    res.json({ totalMissions, activeMissions, totalAttempts, completedAttempts, completionRate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// STUDENT ENDPOINTS
// ═══════════════════════════════════════════

// GET /recommended — Personalized mission recommendations
router.get('/recommended', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'];
    const student = await Student.findOne({ email }).lean();
    if (!student) return res.json([]);

    const activeMissions = await Mission.find({ isActive: true }).lean();
    if (activeMissions.length === 0) return res.json([]);

    // Already-active mission IDs for this student (don't re-recommend)
    const activeAttempts = await MissionAttempt.find({
      studentEmail: email,
      status: { $in: ['active', 'pending'] }
    }).lean();
    const activeIds = new Set(activeAttempts.map(a => String(a.missionId)));

    // ── Detect setbacks ──
    const setbacks = [];

    // 1. SP drop: check recent transactions for net-negative trend
    const recentTx = await SPTransaction.find({ email })
      .sort({ dateTime: -1 }).limit(20).lean();
    const recentDebit = recentTx
      .filter(tx => tx.appliedDelta < 0)
      .reduce((sum, tx) => sum + tx.appliedDelta, 0);
    if (recentDebit <= -15) setbacks.push({ type: 'sp_drop', severity: Math.abs(recentDebit) });

    // 2. Missed attendance
    const recentAttendance = await AttendanceRecord.find({ email })
      .sort({ dateTime: -1 }).limit(5).lean();
    const missed = recentAttendance.filter(a => !a.qualified).length;
    if (missed >= 2) setbacks.push({ type: 'missed_attendance', severity: missed });

    // 3. Failed contests
    const recentContests = await ContestAttempt.find({ studentEmail: email })
      .sort({ completedAt: -1 }).limit(5).lean();
    const failedContests = recentContests.filter(c => !c.passed).length;
    if (failedContests >= 1) setbacks.push({ type: 'contest_fail', severity: failedContests });

    // ── Score & rank missions ──
    const scored = activeMissions
      .filter(m => !activeIds.has(String(m._id)))
      .map(m => {
        let score = 0;
        for (const trigger of (m.triggerConditions || [])) {
          const match = setbacks.find(s => s.type === trigger.type);
          if (match) {
            score += match.severity >= (trigger.threshold || 0) ? 10 : 3;
          }
        }
        // Priority bonus
        if (m.priority === 'high') score += 5;
        else if (m.priority === 'medium') score += 2;

        // Manual missions are always available
        if (m.triggerConditions?.some(t => t.type === 'manual')) score += 1;

        return { ...m, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    res.json({ recommendations: scored, setbacks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /my-missions — Student's missions (active + history)
router.get('/my-missions', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'];
    const attempts = await MissionAttempt.find({ studentEmail: email })
      .sort({ createdAt: -1 }).lean();

    // Attach mission details
    const missionIds = [...new Set(attempts.map(a => String(a.missionId)))];
    const missions = await Mission.find({ _id: { $in: missionIds } }).lean();
    const missionMap = Object.fromEntries(missions.map(m => [String(m._id), m]));

    const enriched = attempts.map(a => ({
      ...a,
      mission: missionMap[String(a.missionId)] || null
    }));

    // Auto-fail overdue missions
    const now = new Date();
    for (const a of enriched) {
      if (a.status === 'active' && a.dueAt && new Date(a.dueAt) < now) {
        await MissionAttempt.findByIdAndUpdate(a._id, { status: 'failed' });
        a.status = 'failed';
      }
    }

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/accept — Accept a mission
router.post('/:id/accept', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'];
    const mission = await Mission.findById(req.params.id).lean();
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!mission.isActive) return res.status(400).json({ error: 'Mission is not active' });

    // Check for existing active attempt
    const existing = await MissionAttempt.findOne({
      studentEmail: email,
      missionId: mission._id,
      status: { $in: ['active', 'pending'] }
    });
    if (existing) return res.status(400).json({ error: 'You already have this mission active' });

    const student = await Student.findOne({ email }).lean();
    const now = new Date();

    const attempt = await MissionAttempt.create({
      studentEmail: email,
      studentName: student?.name || '',
      missionId: mission._id,
      status: 'active',
      startedAt: now,
      dueAt: dueDate(now, mission.duration),
      taskProgress: mission.tasks.map((_, i) => ({
        taskIndex: i,
        completed: false,
        completedAt: null,
        evidenceNote: ''
      })),
      streak: 0
    });

    res.json(attempt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:attemptId/task/:taskIndex — Mark task complete + optional evidence
router.put('/:attemptId/task/:taskIndex', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'];
    const attempt = await MissionAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.studentEmail !== email) return res.status(403).json({ error: 'Forbidden' });
    if (attempt.status !== 'active') return res.status(400).json({ error: 'Mission is not active' });

    const idx = Number(req.params.taskIndex);
    const tp = attempt.taskProgress.find(t => t.taskIndex === idx);
    if (!tp) return res.status(404).json({ error: 'Task not found' });

    tp.completed = true;
    tp.completedAt = new Date();
    if (req.body.evidenceNote) tp.evidenceNote = String(req.body.evidenceNote).slice(0, 2000);

    attempt.streak = calcStreak(attempt.taskProgress);
    await attempt.save();

    res.json(attempt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:attemptId/complete — Submit completion + reflection
router.post('/:attemptId/complete', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'];
    const attempt = await MissionAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.studentEmail !== email) return res.status(403).json({ error: 'Forbidden' });
    if (attempt.status !== 'active') return res.status(400).json({ error: 'Mission is not active' });

    const mission = await Mission.findById(attempt.missionId).lean();
    if (!mission) return res.status(404).json({ error: 'Mission template not found' });

    // Check all tasks completed
    const allDone = attempt.taskProgress.every(t => t.completed);
    if (!allDone) return res.status(400).json({ error: 'Not all tasks are completed yet' });

    const reflection = req.body.reflection ? String(req.body.reflection).slice(0, 5000) : '';
    attempt.reflection = reflection;
    attempt.status = 'completed';
    attempt.completedAt = new Date();
    attempt.streak = calcStreak(attempt.taskProgress);

    // ── Award SP ──
    const student = await Student.findOne({ email });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    let runningBalance = student.totalSp;
    let earnedSp = 0;

    // Base reward
    if (mission.spReward > 0) {
      earnedSp += mission.spReward;
      runningBalance += mission.spReward;
      await SPTransaction.create({
        email,
        studentId: student._id,
        category: 'mission',
        sessionLabel: `Mission: ${mission.name}`,
        deltaMode: 'absolute',
        deltaValue: mission.spReward,
        appliedDelta: mission.spReward,
        balanceAfter: runningBalance,
        reason: `Completed recovery mission: ${mission.name}`,
        dateTime: new Date()
      });
    }

    // Reflection bonus
    if (reflection.length >= 20 && mission.reflectionSpBonus > 0) {
      earnedSp += mission.reflectionSpBonus;
      runningBalance += mission.reflectionSpBonus;
      await SPTransaction.create({
        email,
        studentId: student._id,
        category: 'mission_reflection',
        sessionLabel: `Mission: ${mission.name}`,
        deltaMode: 'absolute',
        deltaValue: mission.reflectionSpBonus,
        appliedDelta: mission.reflectionSpBonus,
        balanceAfter: runningBalance,
        reason: `Reflection bonus for mission: ${mission.name}`,
        dateTime: new Date()
      });
    }

    attempt.earnedSp = earnedSp;
    await attempt.save();

    // Recalculate student SP from ground truth
    await recalculateStudentSp(email);

    res.json({ attempt, earnedSp, runningBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:attemptId/abandon — Abandon a mission
router.post('/:attemptId/abandon', studentGuard, async (req, res) => {
  try {
    const email = req.headers['x-student-email'];
    const attempt = await MissionAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.studentEmail !== email) return res.status(403).json({ error: 'Forbidden' });
    if (attempt.status !== 'active') return res.status(400).json({ error: 'Mission is not active' });

    attempt.status = 'abandoned';
    await attempt.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
