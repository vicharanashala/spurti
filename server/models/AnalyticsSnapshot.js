import mongoose from 'mongoose';

const analyticsSnapshotSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true, unique: true, index: true },
  activeStudents: { type: Number, default: 0 },
  yetToOnboard: { type: Number, default: 0 },
  excused: { type: Number, default: 0 },
  totalStudents: { type: Number, default: 0 },
  avgSp: { type: Number, default: 0 },
  minSp: { type: Number, default: 0 },
  maxSp: { type: Number, default: 0 },
  totalSp: { type: Number, default: 0 },
  spDistribution: {
    veryNegative: { type: Number, default: 0 },
    negative: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    positive: { type: Number, default: 0 },
    veryPositive: { type: Number, default: 0 },
  },
  cohortCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  totalTransactions: { type: Number, default: 0 },
  newTransactionsLast30min: { type: Number, default: 0 },
  sessionsCompleted: { type: Number, default: 0 },
  currentSession: { type: String, default: '' },
  pageViewsLast30min: {
    admin: { type: Number, default: 0 },
    record: { type: Number, default: 0 },
    search: { type: Number, default: 0 },
    intro: { type: Number, default: 0 },
  },
  uniqueUsersLast30min: { type: Number, default: 0 },
  topGainersLast30min: [{
    email: { type: String },
    name: { type: String },
    delta: { type: Number },
  }],
  topLosersLast30min: [{
    email: { type: String },
    name: { type: String },
    delta: { type: Number },
  }],
  redZoneCount: { type: Number, default: 0 },
  studentRanks: [{
    email: { type: String, required: true },
    rank: { type: Number, required: true }
  }],
  studentDeltas: [{
    email: { type: String, required: true },
    delta: { type: Number, required: true }
  }],
  snapshotType: { type: String, enum: ['scheduled', 'manual'], default: 'scheduled' }
}, { timestamps: true });

analyticsSnapshotSchema.index({ timestamp: -1 });
export default mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
