import mongoose from 'mongoose';

/**
 * ChatRecord
 *
 * Aggregated per-session chat-positive scores for a student.
 * Populated by whatever pipeline scrapes / scores the chat transcript
 * (e.g. a scheduled job that runs after the session ends). The weekly
 * leaderboard uses `positiveCount` for the "Community Star" category.
 *
 * Schema matches what `server/routes/weeklyLeaderboard.js` reads:
 *   - email + sessionLabel (join key, unique together)
 *   - positiveCount       (sum of "👍" / helpful reactions)
 *   - messageCount        (raw total — not currently displayed)
 */
const chatRecordSchema = new mongoose.Schema({
  email:        { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  sessionLabel: { type: String, required: true, index: true },
  positiveCount: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
}, { timestamps: true });

chatRecordSchema.index({ email: 1, sessionLabel: 1 }, { unique: true });

export default mongoose.model('ChatRecord', chatRecordSchema);