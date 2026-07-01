import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  raisedByEmail: { type: String, required: true },
  reason: {
    type: String,
    enum: ['quality', 'no_response', 'missed_deadline', 'scope_creep', 'fake_service', 'other'],
    required: true
  },
  description: { type: String, required: true },
  evidence: [{
    type: { type: String, enum: ['text', 'image', 'file', 'screenshot'] },
    url: { type: String },
    caption: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['open', 'under_review', 'resolved', 'closed', 'escalated'],
    default: 'open',
    index: true
  },
  resolution: {
    action: { type: String, enum: ['refund_buyer', 'release_to_provider', 'split', 'no_action'], default: null },
    refundPercentage: { type: Number, default: 0 },
    reason: { type: String, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    resolvedAt: { type: Date, default: null }
  },
  aiAnalysis: {
    verdict: { type: String },
    confidence: { type: Number },
    recommendations: [{ type: String }]
  },
  messages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    senderEmail: { type: String },
    text: { type: String },
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  escrowAmount: { type: Number, default: 0 },
  affectedUsers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    email: { type: String },
    impact: { type: String }
  }]
}, { timestamps: true });

disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ raisedBy: 1, status: 1 });
disputeSchema.index({ serviceId: 1 }, { unique: true });

export default mongoose.model('Dispute', disputeSchema);