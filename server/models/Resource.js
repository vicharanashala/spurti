import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true, index: true },
  category: { 
    type: String, 
    required: true, 
    enum: [
      'Programming', 'DSA', 'Java', 'Python', 'React', 'Node', 
      'Machine Learning', 'Operating System', 'DBMS', 'Computer Networks', 
      'Mathematics', 'Interview Preparation', 'Placement', 'Others'
    ], 
    index: true 
  },
  fileType: { 
    type: String, 
    required: true,
    enum: ['PDF', 'PPT', 'Notes', 'Google Drive', 'YouTube', 'GitHub', 'Article', 'Documentation', 'ZIP', 'Others'] 
  },
  url: { type: String, required: true, trim: true },
  semester: { type: String, default: '', index: true },
  tags: { type: [String], default: [] },
  uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  uploaderName: { type: String, required: true },
  uploaderEmail: { type: String, required: true },
  likesCount: { type: Number, default: 0 },
  bookmarksCount: { type: Number, default: 0 },
  downloadsCount: { type: Number, default: 0 },
  reportsCount: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false, index: true },
  isHighlighted: { type: Boolean, default: false, index: true },
  isPinned: { type: Boolean, default: false, index: true }
}, { timestamps: true });

resourceSchema.index({ title: 'text', description: 'text', tags: 'text', subject: 'text' });

export default mongoose.model('Resource', resourceSchema);
