/**
 * Recovery Missions admin HTTP routes — Tier 5.
 *
 * Recovery Monitor endpoints. Read-only listings + a single
 * enable/disable mutation on mission templates.
 *
 * Auth: every route uses the existing adminGuard from server.js,
 * passed in via ctx (the same DI pattern as Resource Exchange).
 *
 * ponytail: deliberately NO write endpoints for assignments themselves.
 * The scheduler (server/scripts/runRecoveryMissions.js) is the only
 * thing that creates assignments. Admins can enable/disable templates,
 * which the scheduler respects on its next run.
 */
import RecoveryAssignment from '../models/RecoveryAssignment.js';
import RecoveryMission from '../models/RecoveryMission.js';
import MissionAuditEvent from '../models/MissionAuditEvent.js';
import { weekStartUtc, addDays } from '../services/missions.js';
import SPTransaction from '../models/SPTransaction.js';
import Student from '../models/Student.js';

export default function registerAdminMissionRoutes(api, ctx) {
  const { adminGuard } = ctx;

  // ── GET /api/admin/missions/templates — list all templates ───────────────
  // MUST be registered BEFORE /:assignmentId so Express doesn't treat
  // "templates" as an :id. Same bug pattern as Resource Exchange tier 6.
  api.get('/admin/missions/templates', adminGuard, async (_req, res) => {
    const rows = await RecoveryMission.find({})
      .sort({ createdAt: -1 }).lean();
    // Count assignments per template (this week) for admin context.
    const ws = weekStartUtc();
    const counts = await RecoveryAssignment.aggregate([
      { $match: { weekStart: ws } },
      { $group: { _id: '$missionId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map(c => [String(c._id), c.count]));
    res.json({
      templates: rows.map(t => ({
        id: String(t._id),
        title: t.title,
        description: t.description,
        activityType: t.activityType,
        rewardSp: t.rewardSp,
        windowHours: t.windowHours,
        enabled: t.enabled,
        thisWeekAssignments: countMap.get(String(t._id)) || 0,
        createdAt: t.createdAt
      }))
    });
  });

  // ── GET /api/admin/missions/stats — this week's totals ──────────────────
  api.get('/admin/missions/stats', adminGuard, async (_req, res) => {
    const ws = weekStartUtc();
    const [
      assigned, completed, expired, inProgress
    ] = await Promise.all([
      RecoveryAssignment.countDocuments({ weekStart: ws, status: 'assigned' }),
      RecoveryAssignment.countDocuments({ weekStart: ws, status: 'completed' }),
      RecoveryAssignment.countDocuments({ weekStart: ws, status: 'expired' }),
      RecoveryAssignment.countDocuments({ weekStart: ws, status: 'in_progress' })
    ]);

    // SP awarded = sum of rewardApplied across completed assignments this
    // week. We don't sum SPTransaction because a future feature might write
    // SP from another source — the assignment row's rewardApplied IS the
    // authoritative reward number for the recovery-mission flow.
    const rewardAgg = await RecoveryAssignment.aggregate([
      { $match: { weekStart: ws, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$rewardApplied' } } }
    ]);
    const spAwarded = rewardAgg.length ? rewardAgg[0].total : 0;

    // Candidates = students whose recent baseline shows engagement drop.
    // We compute this server-side using the same scoring as the scheduler
    // — running the detection function over the current student set.
    // For tier 5, we use a cheaper proxy: distinct studentIds who have
    // an assignment OR a recent SP decline (negative 7d delta in the
    // baseline cohort). The full re-run of selectRecoveryCandidates is
    // reserved for the scheduler; here we surface "students who were
    // recently active but aren't anymore" via the assignment set
    // expanded with a quick SP scan.
    //
    // ponytail: for v1, candidates = assigned + expired + in_progress +
    // the count of distinct active students whose 7d SP delta is < 0
    // (a cheap indicator). This is a reasonable proxy without a full
    // scheduler run; it's accurate enough for the monitor's purpose.
    const decliningStudents = await SPTransaction.aggregate([
      { $match: { dateTime: { $gte: addDays(new Date(), -7) } } },
      { $group: { _id: '$studentId', weekDelta: { $sum: '$appliedDelta' } } },
      { $match: { weekDelta: { $lt: 0 } } },
      { $count: 'count' }
    ]);
    const declineCount = decliningStudents.length ? decliningStudents[0].count : 0;

    // Candidates = unique students the system noticed — assigned + the
    // declining students not yet assigned. Best-effort, never < assigned.
    const candidates = Math.max(assigned + inProgress + expired, declineCount);

    res.json({
      weekStart: ws.toISOString(),
      candidates,
      assigned: assigned + inProgress,
      completed,
      expired,
      spAwarded
    });
  });

  // ── GET /api/admin/missions — list assignments with filters ──────────────
  // Filters: ?status=assigned|in_progress|completed|expired
  //          ?cohort=<cohort>
  //          ?weekStart=YYYY-MM-DD (default = current week)
  api.get('/admin/missions', adminGuard, async (req, res) => {
    const ws = req.query.weekStart
      ? new Date(req.query.weekStart + 'T00:00:00Z')
      : weekStartUtc();
    const filter = { weekStart: ws };
    if (req.query.status) filter.status = req.query.status;
    const studentFilter = {};
    if (req.query.cohort) studentFilter.cohort = req.query.cohort;

    // Pull students matching cohort first (if requested).
    // Note: the Student model uses `leaderboardGroup` (not `cohort`)
    // for cohort grouping — same semantics, computed in
    // services/levels.js from internshipStartDate. We accept the
    // query param as `?cohort=` for the admin URL but read the
    // matching Student field.
    let studentIds;
    if (req.query.cohort) {
      const ss = await Student.find({ leaderboardGroup: req.query.cohort })
        .select({ _id: 1 }).lean();
      studentIds = ss.map(s => s._id);
      filter.studentId = { $in: studentIds };
    }

    const rows = await RecoveryAssignment.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    // Hydrate the student + mission data we want to show.
    const studentMap = new Map();
    const allStudents = await Student.find({
      _id: { $in: rows.map(r => r.studentId) }
    }).select({ _id: 1, name: 1, email: 1, leaderboardGroup: 1 }).lean();
    for (const s of allStudents) studentMap.set(String(s._id), s);

    const missionMap = new Map();
    const allMissions = await RecoveryMission.find({
      _id: { $in: rows.map(r => r.missionId) }
    }).select({ _id: 1, title: 1, activityType: 1, rewardSp: 1 }).lean();
    for (const m of allMissions) missionMap.set(String(m._id), m);

    res.json({
      weekStart: ws.toISOString(),
      rows: rows.map(a => {
        const s = studentMap.get(String(a.studentId)) || {};
        const m = missionMap.get(String(a.missionId)) || {};
        return {
          assignmentId: String(a._id),
          student: {
            name: s.name || '',
            email: s.email || a.studentEmail,
            cohort: s.leaderboardGroup || ''
          },
          mission: {
            id: String(a.missionId),
            title: m.title || '',
            activityType: m.activityType || '',
            rewardSp: m.rewardSp || 0
          },
          status: a.status,
          triggerReason: a.triggerReason,
          spDelta7d: a.spDelta7d,
          baseline14d: a.spAtDetection,
          rewardApplied: a.rewardApplied,
          createdAt: a.createdAt,
          completedAt: a.completedAt,
          expiresAt: a.expiresAt
        };
      })
    });
  });

  // ── GET /api/admin/missions/:assignmentId — full detail ──────────────────
  api.get('/admin/missions/:assignmentId', adminGuard, async (req, res) => {
    const a = await RecoveryAssignment.findById(req.params.assignmentId).lean();
    if (!a) return res.status(404).json({ error: 'assignment not found' });
    const [s, m] = await Promise.all([
      Student.findById(a.studentId).select({ name: 1, email: 1, leaderboardGroup: 1, totalSp: 1 }).lean(),
      RecoveryMission.findById(a.missionId).lean()
    ]);
    if (!m) return res.status(404).json({ error: 'mission template missing' });
    res.json({
      assignmentId: String(a._id),
      student: s ? {
        name: s.name, email: s.email, cohort: s.leaderboardGroup,
        currentTotalSp: s.totalSp
      } : { email: a.studentEmail },
      mission: {
        id: String(m._id),
        title: m.title,
        description: m.description,
        activityType: m.activityType,
        rewardSp: m.rewardSp
      },
      status: a.status,
      triggerReason: a.triggerReason,
      spDelta7d: a.spDelta7d,
      spAtDetection: a.spAtDetection,
      rewardApplied: a.rewardApplied,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
      expiresAt: a.expiresAt
    });
  });

  // ── GET /api/admin/missions/:assignmentId/audit — timeline ───────────────
  api.get('/admin/missions/:assignmentId/audit', adminGuard, async (req, res) => {
    const events = await MissionAuditEvent.find({
      assignmentId: req.params.assignmentId
    }).sort({ at: 1 }).lean();
    res.json({
      events: events.map(e => ({
        id: String(e._id),
        kind: e.kind,
        actorType: e.actorType,
        actorEmail: e.actorEmail,
        at: e.at,
        payload: e.payload
      }))
    });
  });

  // ── PATCH /api/admin/missions/templates/:id — enable/disable ────────────
  api.patch('/admin/missions/templates/:id', adminGuard, async (req, res) => {
    const enabledRaw = req.body && req.body.enabled;
    if (typeof enabledRaw !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) required' });
    }
    const t = await RecoveryMission.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'template not found' });
    t.enabled = enabledRaw;
    await t.save();

    await MissionAuditEvent.create({
      assignmentId: null,
      studentId: null,
      actorType: 'admin',
      actorEmail: (req.adminEmail || null),
      kind: 'mission.template_changed',
      payload: {
        templateId: String(t._id),
        templateTitle: t.title,
        enabled: enabledRaw
      }
    });

    res.json({
      template: {
        id: String(t._id), title: t.title, enabled: t.enabled
      }
    });
  });
}