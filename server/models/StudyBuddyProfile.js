import mongoose from 'mongoose';

const studyBuddyProfileSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  preferredSubjects: { type: [String], default: [] },
  currentSemester: { type: String, default: '' },
  course: { type: String, default: '' },
  learningGoals: { type: [String], default: [] },
  preferredStudyTime: { type: String, default: '' }, // e.g. Morning, Afternoon, Night, Flexible
  weeklyAvailability: { type: Number, default: 0 }, // hours
  languages: { type: [String], default: [] },
  interests: { type: [String], default: [] },
  skillLevel: { type: String, default: 'Intermediate' }, // Beginner, Intermediate, Advanced
  
  // Progress tracking fields
  studyHours: { type: Number, default: 0 },
  weeklyGoal: { type: String, default: '' },
  weeklyGoalCompleted: { type: Boolean, default: false },
  completedTasksCount: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('StudyBuddyProfile', studyBuddyProfileSchema);
