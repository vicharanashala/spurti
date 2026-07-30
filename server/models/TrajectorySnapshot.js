import mongoose from 'mongoose';

// Precomputed average SP trajectories (cumulative SP by week-since-join), so the
// student trajectory chart can show cohort + onboarding-group reference lines
// without aggregating every student's ledger on each page load. One 'latest' doc,
// refreshed by server/scripts/buildTrajectories.js (wire into the analytics cron in prod).
const pointSchema = new mongoose.Schema({ week: Number, sp: Number, n: Number }, { _id: false });

const trajectorySnapshotSchema = new mongoose.Schema({
  key: { type: String, default: 'latest', unique: true },
  weeks: { type: Number, default: 10 },
  cohort: { type: [pointSchema], default: [] },        // mean cumulative SP by week, all non-excused students
  groups: { type: Object, default: {} },               // { <groupKey>: [{week,sp,n}] }
  groupLabels: { type: Object, default: {} },          // { <groupKey>: "1 May to 15 May" }
  computedAt: { type: Date }
}, { minimize: false });

export default mongoose.model('TrajectorySnapshot', trajectorySnapshotSchema);
