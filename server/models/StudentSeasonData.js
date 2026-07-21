import mongoose from 'mongoose';

const studentSeasonDataSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
  
  // Matrix Mystics Endorsements (Array of question numbers, e.g., 1-53)
  matrixMysticsEndorsements: { type: [Number], default: [] },
  
  // Disciplinary & spam filters
  hasSpamPenalties: { type: Boolean, default: false },
  hasDisciplinaryActions: { type: Boolean, default: false },
  
  // Nomination
  isNominated: { type: Boolean, default: false, index: true },
  nominationStatement: { type: String, default: '' },
  nominatedBy: { type: String, default: '' }, // Email of nominator (empty for self-nomination)
  
  // Voter emails (each student gets 1 vote per season)
  votes: { type: [String], default: [] },
  
  // Results
  isElected: { type: Boolean, default: false, index: true },
  councilScore: { type: Number, default: 0 }
}, { timestamps: true });

studentSeasonDataSchema.index({ studentId: 1, seasonId: 1 }, { unique: true });

export default mongoose.models.StudentSeasonData || mongoose.model('StudentSeasonData', studentSeasonDataSchema);
