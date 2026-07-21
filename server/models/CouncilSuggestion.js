import mongoose from 'mongoose';

const councilSuggestionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
  type: {
    type: String,
    enum: ['weeklyQuest', 'communityChallenge', 'structuredFeedback', 'platformImprovement'],
    required: true,
    index: true
  },
  content: { type: String, required: true },
  votes: { type: [String], default: [] } // Student emails of other council members who support this suggestion
}, { timestamps: true });

export default mongoose.models.CouncilSuggestion || mongoose.model('CouncilSuggestion', councilSuggestionSchema);
