import mongoose from 'mongoose';

const peerReviewSubmissionSchema = new mongoose.Schema({
  studentEmail: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentName: { type: String, required: true },

  prLink: { type: String, required: true },
  teamLink: { type: String, default: null, index: true },
  resolvedPrUrl: { type: String, default: null },
  projectReport: { type: String, required: true },
  productMd: { type: String, required: true },

  submittedAt: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['submitted', 'under_review', 'reviewed'], default: 'submitted' },

  reviewCount: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  spAwarded: { type: Number, default: 0 },
  spAwardedAt: { type: Date, default: null }
}, { timestamps: true });

peerReviewSubmissionSchema.index({ status: 1, studentEmail: 1 });

export default mongoose.model('PeerReviewSubmission', peerReviewSubmissionSchema);
