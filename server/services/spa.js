// SPA → SP module logic (peer-teaching endorsement activity) — DISPLAY layer.
// The SP itself is scored + credited by the pipeline rubric
// (pipeline/sp-rubric-build-mirror.cjs, Pattern A): +5 per validated question
// learned, +8 per validated peer taught (capped 50/30), minus a one-time
// audit/fraud penalty. The rubric writes the `spaprogresses` summary this reads.
// The web app NEVER writes SP — it only renders what the rubric produced.
// Universal: applies to ALL cohorts (15-May onward).
import Student from '../models/Student.js';
import SpaProgress from '../models/SpaProgress.js';

export function isSpaEligible() { return true; } // SPA SP is a universal feature.

// LOCKED scheme (see memory: spa-sp-award-scheme).
export const CONFIG = {
  learnUnit: 5,  learnCap: 50,   // +5 SP per validated question learned, cap 50  → max 250
  teachUnit: 8,  teachCap: 30,   // +8 SP per validated endorsement given, cap 30 → max 240
  fraudRate: 0.5,                // genuine fraud  → -50% of current SP (one-time)
  auditRate: 0.2                 // audit failure  → -20% of current SP (one-time)
};
export const MAX_SPA_SP = CONFIG.learnUnit * CONFIG.learnCap + CONFIG.teachUnit * CONFIG.teachCap; // 490

// Pure computation of the SP breakdown from a SpaProgress row (display).
export function computeSpaSp(prog) {
  const learnCounted = Math.min(prog.learnValidated || 0, CONFIG.learnCap);
  const teachCounted = Math.min(prog.teachValidated || 0, CONFIG.teachCap);
  return {
    learn: { validated: prog.learnValidated || 0, counted: learnCounted, credited: prog.learnCredited || 0,
             cap: CONFIG.learnCap, unit: CONFIG.learnUnit, sp: learnCounted * CONFIG.learnUnit },
    teach: { validated: prog.teachValidated || 0, counted: teachCounted, credited: prog.teachCredited || 0,
             cap: CONFIG.teachCap, unit: CONFIG.teachUnit, sp: teachCounted * CONFIG.teachUnit },
    grossSp: learnCounted * CONFIG.learnUnit + teachCounted * CONFIG.teachUnit,
    penalty: { fraud: !!prog.fraud, auditFail: !!prog.auditFail,
               rate: prog.fraud ? CONFIG.fraudRate : (prog.auditFail ? CONFIG.auditRate : 0),
               applied: prog.penaltyApplied || 0, at: prog.penaltyAt || null,
               done: (prog.penaltyApplied || 0) > 0 }
  };
}

// Build the student-facing SPA state. DISPLAY ONLY — the SP itself is scored and
// credited by the pipeline rubric (sp-rubric-build-mirror.cjs, Pattern A), which
// also writes the `spaprogresses` summary this reads. The web app never writes SP.
export async function buildSpaState(student) {
  const prog = await SpaProgress.findOne({ email: student.email }).lean();
  const stu = await Student.findOne({ email: student.email }).lean();
  if (!prog) {
    return { eligible: true, name: student.name, totalSp: stu?.totalSp || 0,
      activity: 'Activity 1: Linear Algebra', hasActivity: false, config: CONFIG, maxSp: MAX_SPA_SP };
  }
  const calc = computeSpaSp(prog);
  return {
    eligible: true,
    name: student.name,
    totalSp: stu?.totalSp || 0,
    activity: prog.activity,
    hasActivity: (prog.learnValidated || 0) + (prog.teachValidated || 0) > 0,
    ...calc,
    creditedSp: Math.min(calc.learn.credited, CONFIG.learnCap) * CONFIG.learnUnit
      + Math.min(calc.teach.credited, CONFIG.teachCap) * CONFIG.teachUnit,
    maxSp: MAX_SPA_SP,
    config: CONFIG
  };
}
