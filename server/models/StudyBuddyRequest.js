import mongoose from 'mongoose';

const studyBuddyRequestSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending', index: true }
}, { timestamps: true });

export default mongoose.model('StudyBuddyRequest', studyBuddyRequestSchema);
