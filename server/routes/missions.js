/**
 * Recovery Missions student HTTP routes — Tier 3 + Tier 4.
 *
 * Endpoints:
 *   GET   /api/missions/me          current week's assignment + mission
 *   PATCH /api/missions/me          state transition (start | complete)
 *
 * Tier 3: GET returns current state; PATCH start flips to in_progress;
 *         PATCH complete flips to completed and writes mission.completed.
 * Tier 4: PATCH complete server-side validates the underlying activity,
 *         applies +N SP through the existing applySpDelta helper, writes
 *         mission.rewarded. Fail-closed: any SP/audit failure rolls
 *         status back to in_progress so the student can retry.
 *
 * ponytail: PATCH is :id-free. Student identity from cookie, current week
 * derived server-side. The student cannot tamper with another student's
 * assignment via this endpoint.
 *
 * ponytail: applySpDelta is injected via ctx so tests can swap in a
 * throwing stub. Same DI pattern as the Resource Exchange routes use
 * for appendAudit.
 */
import RecoveryAssignment from '../models/RecoveryAssignment.js';
import RecoveryMission from '../models/RecoveryMission.js';
import MissionAuditEvent from '../models/MissionAuditEvent.js';
import PollRecord from '../models/PollRecord.js';
import {
  weekStartUtc,
  validateCompletionAttempt, checkCompletion
} from '../services/missions.js';
import {
  requireExperimentalFeaturesEnabled
} from '../services/featureControl.js';

// Default applySpDelta import — overridden by ctx for tests.
import { applySpDelta as defaultApplySpDelta } from '../services/vibe.js';

export default function registerMissionRoutes(api, ctx) {
  const { requireStudent } = ctx;
  const applySpDelta = ctx.applySpDelta || defaultApplySpDelta;

  // GET /api/missions/me — current week's assignment + mission template.
  //   Returns:
   //   { enabled: true,  assignment: null }    → no mission this week
   //   { enabled: false }                      → feature off (hidden by SPA)
   // Tier 9: same experimental-features toggle as Resource Exchange.
   // When disabled, the route returns 403 with the canonical error code
   // so the SPA can hide the widget cleanly.
   api.get('/missions/me', requireExperimentalFeaturesEnabled, async (req, res) => {
     const auth = await requireStudent(req, res);
     if (!auth) return;
     const studentEmail = auth.email;
    const ws = weekStartUtc();
    const a = await RecoveryAssignment.findOne({
      studentEmail,
      weekStart: ws
    }).lean();
    if (!a) {
      return res.json({ enabled: true, assignment: null });
    }
    const mission = await RecoveryMission.findById(a.missionId).lean();
    if (!mission) {
      return res.json({ enabled: true, assignment: null });
    }
    return res.json({
      enabled: true,
      assignment: {
        id: String(a._id),
        status: a.status,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
        rewardApplied: a.rewardApplied,
        mission: {
          id: String(mission._id),
          title: mission.title,
          description: mission.description,
          activityType: mission.activityType,
          rewardSp: mission.rewardSp
        }
      }
    });
  });

  // PATCH /api/missions/me — state transitions.
  // Body: { event: 'start' | 'complete' }
  // Tier 3 keeps 'start' (state flip only, no audit row).
  // Tier 4 upgrades 'complete':
  //   - load PollRecord and run checkCompletion()
  //   - flip status (atomic claim)
  //   - apply SP via applySpDelta (existing ledger)
  //   - write mission.completed + mission.rewarded audit rows
  //   - if any step fails, roll back status to in_progress so the
  //     student can retry (no phantom completion)
  api.patch('/missions/me', requireExperimentalFeaturesEnabled, async (req, res) => {
    const auth = await requireStudent(req, res);
    if (!auth) return;
    const studentEmail = auth.email;
    const ws = weekStartUtc();
    const event = (req.body && req.body.event) || '';
    const allowedEvents = ['start', 'complete'];
    if (!allowedEvents.includes(event)) {
      return res.status(400).json({ error: 'event must be one of: start, complete' });
    }

    const a = await RecoveryAssignment.findOne({ studentEmail, weekStart: ws });
    if (!a) return res.status(404).json({ error: 'no mission this week' });
    const mission = await RecoveryMission.findById(a.missionId).lean();
    if (!mission) return res.status(404).json({ error: 'mission template missing' });

    const guard = validateCompletionAttempt(
      a.toObject(), mission,
      false  // tier 4 still single-mission-per-week so this stays false here;
             // — could be tightened later
    );
    if (!guard.allowed) {
      return res.status(409).json({ error: guard.reason });
    }

    // ── 'start' event — tier 3 behaviour unchanged ───────────────────────────
    if (event === 'start') {
      if (a.status === 'in_progress' || a.status === 'completed' || a.status === 'expired') {
        return res.status(409).json({ error: `cannot start from status=${a.status}` });
      }
      a.status = 'in_progress';
      await a.save();
      return res.json({
        assignment: {
          id: String(a._id), status: a.status,
          mission: { id: String(mission._id), title: mission.title, rewardSp: mission.rewardSp }
        }
      });
    }

    // ── 'complete' event — tier 4 ────────────────────────────────────────────
    // Atomic claim: only one concurrent request can win the status flip.
    // The second sees status=completed and returns 409.
    if (a.status === 'completed') return res.status(409).json({ error: 'already completed' });
    if (a.status === 'expired')    return res.status(409).json({ error: 'window expired' });
    if (new Date() > new Date(a.expiresAt)) {
      return res.status(409).json({ error: 'window expired (clock)' });
    }

    // Load the student's recent activity for checkCompletion.
    let recentActivity = {};
    if (mission.activityType === 'poll_check') {
      const pollName = mission.activityPayload && mission.activityPayload.pollName;
      if (!pollName) {
        return res.status(500).json({ error: 'template missing pollName' });
      }
      const pr = await PollRecord.findOne({
        email: studentEmail,
        sessionLabel: pollName
      }).lean();
      recentActivity.pollAnswers = pr
        ? Array(pr.attemptedQuestions || 0).fill('x')
        : [];
    } else if (mission.activityType === 'contribute') {
      // For tier 4, no `contribute` integration — the widget only ships
      // poll_check. The slot is reserved so tier 5+ can wire it without
      // changing this route.
      recentActivity.contributions = [];
    }

    const result = checkCompletion(mission, a.toObject(), recentActivity);
    if (!result.ok) {
      return res.status(422).json({ error: 'completion criteria not met', detail: result });
    }

    // Claim: flip status to completed. If save throws, return 500.
    a.status = 'completed';
    a.completedAt = new Date();
    try {
      await a.save();
    } catch (err) {
      console.error('mission: status save failed', err);
      return res.status(500).json({ error: 'could not claim mission' });
    }

    // Apply SP + write audits. If any of these fail, rollback the
    // status to in_progress so the student can retry without losing
    // their work. This is the fail-closed contract.
    let newBalance = null;
    try {
      newBalance = await applySpDelta(
        studentEmail,
        mission.rewardSp,
        `Recovery mission: ${mission.title}`
      );
      a.rewardApplied = mission.rewardSp;
      await a.save();
      await MissionAuditEvent.create({
        assignmentId: a._id,
        studentId: a.studentId,
        actorType: 'student',
        actorEmail: studentEmail,
        kind: 'mission.completed',
        payload: {
          missionId: String(mission._id),
          missionTitle: mission.title,
          fromStatus: 'in_progress',
          toStatus: 'completed'
        }
      });
      await MissionAuditEvent.create({
        assignmentId: a._id,
        studentId: a.studentId,
        actorType: 'system',
        actorEmail: null,
        kind: 'mission.rewarded',
        payload: {
          missionId: String(mission._id),
          rewardSp: mission.rewardSp,
          appliedDelta: mission.rewardSp,
          balanceAfter: newBalance,
          reason: `Recovery mission: ${mission.title}`
        }
      });
    } catch (err) {
      // Fail-closed: roll back the status flip so the student can retry.
      console.error('mission: SP/audit failed, rolling back', err);
      try {
        const fresh = await RecoveryAssignment.findById(a._id);
        if (fresh && fresh.status === 'completed') {
          fresh.status = 'in_progress';
          fresh.completedAt = null;
          fresh.rewardApplied = null;
          await fresh.save();
        }
      } catch (rollbackErr) {
        // If the rollback itself fails, the row is in a bad state.
        // Returning 500 surfaces this to the caller — better than
        // pretending success.
        console.error('mission: rollback failed', rollbackErr);
      }
      return res.status(500).json({ error: 'reward failed — please retry' });
    }

    return res.json({
      assignment: {
        id: String(a._id),
        status: a.status,
        completedAt: a.completedAt,
        rewardApplied: a.rewardApplied,
        mission: {
          id: String(mission._id),
          title: mission.title,
          rewardSp: mission.rewardSp
        }
      }
    });
  });
}