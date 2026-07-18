import mongoose from 'mongoose';

const seasonSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true, index: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  maxSpCapForScore: { type: Number, default: 1000 },
  councilSize: { type: Number, default: 5 },
  minEndorsementsRequired: { type: Number, default: 40 },
  minSpRequired: { type: Number, default: 500 }
}, { timestamps: true });

export default mongoose.models.Season || mongoose.model('Season', seasonSchema);
