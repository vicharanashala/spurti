import mongoose from 'mongoose';

const reflectionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  weekLabel: { type: String, required: true, trim: true, index: true },
  learnedText: { type: String, required: true, trim: true, maxlength: 500 },
  challengedText: { type: String, required: false, trim: true, maxlength: 500, default: '' },
  improvementText: { type: String, required: false, trim: true, maxlength: 500, default: '' },
  appreciationCount: { type: Number, default: 0 },
  moderationStatus: {
    type: String,
    enum: ['published', 'flagged', 'hidden'],
    default: 'published',
    index: true
  },
  submittedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

reflectionSchema.index({ email: 1, weekLabel: 1 }, { unique: true });

export default mongoose.model('Reflection', reflectionSchema);
