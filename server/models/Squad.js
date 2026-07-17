import mongoose from 'mongoose';

const squadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  members: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    email: { type: String, required: true, lowercase: true },
    joinedAt: { type: Date, default: Date.now }
  }],
  pendingInvites: [{
    email: { type: String, required: true, lowercase: true },
    invitedBy: { type: String, required: true },
    invitedAt: { type: Date, default: Date.now }
  }],
  challengeLockedUntil: { type: Date, default: null },
  challengeHistory: [{
    weekStart: Date,
    weekEnd: Date,
    status: { type: String, enum: ['completed', 'failed'] },
    completedAt: Date
  }]
}, { timestamps: true });

squadSchema.index({ 'members.email': 1 });
squadSchema.index({ 'pendingInvites.email': 1 });

export default mongoose.model('Squad', squadSchema);
