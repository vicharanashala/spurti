import mongoose from 'mongoose';

const studyBuddySchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  buddyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true }
}, { timestamps: true });

studyBuddySchema.index({ studentId: 1, buddyId: 1 }, { unique: true });

export default mongoose.model('StudyBuddy', studyBuddySchema);
