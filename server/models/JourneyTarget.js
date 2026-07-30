import mongoose from 'mongoose';

const journeyTargetSchema = new mongoose.Schema({
  window: { type: String, enum: ['weekly', 'monthly', 'tenure'], required: true, unique: true },
  label: { type: String, required: true },
  checkpointCount: { type: Number, required: true, min: 1, max: 10 },
  attendanceTargetPct: { type: Number, required: true, min: 0, max: 100 },
  pollTargetPct: { type: Number, required: true, min: 0, max: 100 },
  attendanceWeight: { type: Number, default: 50, min: 0, max: 100 },
  pollWeight: { type: Number, default: 50, min: 0, max: 100 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('JourneyTarget', journeyTargetSchema);
