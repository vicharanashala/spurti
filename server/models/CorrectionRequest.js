import mongoose from 'mongoose';

/**
 * CorrectionRequest Schema
 * Stores student-submitted SP discrepancy requests with media proof.
 * Admins review these, attach an official comment, and approve or reject.
 */
const correctionRequestSchema = new mongoose.Schema(
  {
    // Matches the student's primary email in the Student collection.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },

    // The session the student believes was recorded incorrectly, e.g. 'Day 20 (8 Jun)'.
    sessionLabel: {
      type: String,
      required: true,
      trim: true
    },

    // Whether this is an attendance or poll SP discrepancy.
    category: {
      type: String,
      enum: ['attendance', 'poll'],
      required: true
    },

    // The student's detailed explanation of why they believe an error occurred.
    studentReason: {
      type: String,
      required: true,
      trim: true
    },

    // Any additional specific comments or remarks the student wants to add.
    studentComment: {
      type: String,
      default: '',
      trim: true
    },

    // The media type of the uploaded proof.
    proofType: {
      type: String,
      enum: ['image', 'video'],
      required: true
    },

    // The publicly accessible URL of the image or video proof.
    proofUrl: {
      type: String,
      required: true,
      trim: true
    },

    // Lifecycle status of the request.
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },

    // Official closing remark from the admin who processed this request.
    adminComment: {
      type: String,
      default: '',
      trim: true
    },

    // Email of the admin who approved or rejected the request.
    reviewedBy: {
      type: String,
      default: null
    },

    // Timestamp when the admin took action.
    actionedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Composite index for fast admin queue queries (pending, oldest first).
correctionRequestSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('CorrectionRequest', correctionRequestSchema);
