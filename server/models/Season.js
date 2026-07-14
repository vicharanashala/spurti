import mongoose from 'mongoose';

const seasonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // ISO date string or Date — inclusive bounds
  startDate: { type: Date, required: true, index: true },
  endDate:   { type: Date, required: true, index: true },
  // derived from startDate/endDate — updated on each save
  status: {
    type: String,
    enum: ['upcoming', 'active', 'ended'],
    default: 'active',
    index: true
  },
  // CSS colour or gradient for the season theme (display only)
  themeColor: { type: String, default: '#176b87' },
  // Optional season number for ordinal display ("Season 3")
  number: { type: Number, default: null },
  // Admin note
  description: { type: String, default: '' }
}, { timestamps: true });

// Automatically keep status in sync with current time
seasonSchema.pre('save', function () {
  const now = Date.now();
  if (this.startDate > now)        this.status = 'upcoming';
  else if (this.endDate < now)     this.status = 'ended';
  else                             this.status = 'active';
});

seasonSchema.pre('find', function () {
  // Ensure query context for auto-status filtering if needed
});

export default mongoose.model('Season', seasonSchema);