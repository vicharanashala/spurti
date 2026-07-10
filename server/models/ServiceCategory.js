import mongoose from 'mongoose';

const serviceCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  icon: { type: String, default: '📚' },
  description: { type: String, default: '' },
  color: { type: String, default: '#6366f1' },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', default: null },
  subcategories: [{ type: String }],
  basePrice: { type: Number, default: 10 },
  difficultyMultipliers: {
    easy: { type: Number, default: 1.0 },
    medium: { type: Number, default: 2.0 },
    hard: { type: Number, default: 4.0 },
    expert: { type: Number, default: 6.0 }
  },
  averageDuration: { type: Number, default: 30 },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

serviceCategorySchema.index({ parentId: 1 });
serviceCategorySchema.index({ isActive: 1 });

export default mongoose.model('ServiceCategory', serviceCategorySchema);