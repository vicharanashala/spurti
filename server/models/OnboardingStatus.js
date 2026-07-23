import mongoose from 'mongoose';

const onboardingStatusSchema = new mongoose.Schema({
  studentEmail: { type: String, required: true, unique: true },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('OnboardingStatus', onboardingStatusSchema, 'onboardingstatuses');
