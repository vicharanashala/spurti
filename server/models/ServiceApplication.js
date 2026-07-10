import mongoose from 'mongoose';

const serviceApplicationSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  applicantEmail: { type: String, required: true, index: true },
  coverMessage: { type: String, default: '' },
  proposedPrice: { type: Number, required: true },
  proposedDuration: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending',
    index: true
  },
  matchScore: { type: Number, default: 0 },
  aiAnalysis: {
    strengths: [{ type: String }],
    concerns: [{ type: String }],
    recommendation: { type: String }
  },
  respondedAt: { type: Date, default: null },
  responseReason: { type: String, default: '' }
}, { timestamps: true });

serviceApplicationSchema.index({ serviceId: 1, applicantId: 1 }, { unique: true });
serviceApplicationSchema.index({ applicantId: 1, status: 1 });

export default mongoose.model('ServiceApplication', serviceApplicationSchema);