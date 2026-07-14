import mongoose from 'mongoose';

const flexibleDayRequestSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  sessionLabel: {
    type: String,
    required: true
  },
  sessionDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'AUTO_EXPIRED'],
    default: 'PENDING',
    index: true
  },
  disclaimerAccepted: {
    type: Boolean,
    required: true,
    validate: {
      validator: function(v) {
        return v === true;
      },
      message: 'Disclaimer must be accepted'
    }
  },
  disclaimerAcceptedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date,
    default: null
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instructor',
    required: true,
    index: true
  },
  instructorNote: {
    type: String,
    default: null
  },
  spDeducted: {
    type: Boolean,
    default: false
  },
  spDeductedAt: {
    type: Date,
    default: null
  },
  autoExpiredAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

flexibleDayRequestSchema.index({ studentId: 1, status: 1 });
flexibleDayRequestSchema.index({ sessionId: 1 });
flexibleDayRequestSchema.index({ status: 1, requestedAt: 1 });
flexibleDayRequestSchema.index({ instructorId: 1, status: 1 });

flexibleDayRequestSchema.statics.getUsedCount = async function(studentId) {
  return this.countDocuments({
    studentId: new mongoose.Types.ObjectId(studentId),
    status: { $in: ['PENDING', 'APPROVED'] }
  });
};

export default mongoose.model('FlexibleDayRequest', flexibleDayRequestSchema);
