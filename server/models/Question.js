import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  body: { type: String, required: true },
  author: {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
  body: { type: String, required: true },
  author: {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true }
  },
  isAccepted: { type: Boolean, default: false },
  comments: [commentSchema]
}, { timestamps: true });

const questionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  tags: [{ type: String, trim: true }],
  author: {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true }
  },
  pinned: { type: Boolean, default: false },
  isSpam: { type: Boolean, default: false },
  answers: [answerSchema]
}, { timestamps: true });

// Add text index for search functionality
questionSchema.index({ title: 'text', description: 'text', tags: 'text' });

export default mongoose.model('Question', questionSchema);
