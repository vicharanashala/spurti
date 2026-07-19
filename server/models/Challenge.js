import mongoose from 'mongoose';

const auditTrailSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  actor: { type: String, required: true },
  action: { type: String, required: true },
  detail: { type: String, default: '' }
}, { _id: false });

const challengeSchema = new mongoose.Schema({
  challengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  challengerEmail: { type: String, required: true, lowercase: true, trim: true },
  challengerName: { type: String, required: true },

  opponentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  opponentEmail: { type: String, required: true, lowercase: true, trim: true },
  opponentName: { type: String, required: true },

  topic: {
    type: String,
    required: true,
    enum: ['vibe_course', 'matrix_questions', 'poll_accuracy']
  },
  topicRef: {
    label: { type: String, required: true },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true }
  },

  betAmount: { type: Number, required: true, min: 1 },

  status: {
    type: String,
    required: true,
    enum: ['pending', 'expired', 'declined', 'cancelled', 'active', 'completed', 'void'],
    default: 'pending'
  },

  requestedAt: { type: Date, default: Date.now },
  respondTimeoutAt: { type: Date, required: true },
  respondedAt: { type: Date },

  startAt: { type: Date },
  endAt: { type: Date },

  escrow: {
    challengerLocked: { type: Number, default: 0 },
    opponentLocked: { type: Number, default: 0 }
  },

  progressSnapshot: {
    challenger: { type: Number, default: 0 },
    opponent: { type: Number, default: 0 }
  },
  progressFinal: {
    challenger: { type: Number, default: 0 },
    opponent: { type: Number, default: 0 }
  },

  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  loserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  resultReason: { type: String, default: '' },

  settledAt: { type: Date },
  settledBy: {
    type: String,
    enum: ['auto', 'admin'],
    default: 'auto'
  },

  auditTrail: [auditTrailSchema]
}, { timestamps: true });

// Create indexes required for performance and lookups
challengeSchema.index({ challengerId: 1, status: 1 });
challengeSchema.index({ opponentId: 1, status: 1 });
challengeSchema.index({ status: 1, respondTimeoutAt: 1 });
challengeSchema.index({ status: 1, endAt: 1 });

export default mongoose.model('Challenge', challengeSchema);
