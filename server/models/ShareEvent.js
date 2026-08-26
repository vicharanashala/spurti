import mongoose from 'mongoose';

// One row per time a student shares or downloads an achievement card. This is
// the point of the whole feature — knowing whether students actually post them,
// and which achievements are worth posting.
//
// The achievement's category is copied onto the event rather than joined back
// through achId. It costs a few bytes and makes "which category gets shared
// most" a single group-by; it also freezes what the achievement WAS at the
// moment it was shared, which a join would silently lose if a title or a
// board's wording ever changed.
const shareEventSchema = new mongoose.Schema({
  studentId: { type: String, required: true, index: true },
  email: { type: String, default: '' },
  name: { type: String, default: '' },

  achId: { type: String, required: true, index: true },
  verifyId: { type: String, default: '', index: true },
  title: { type: String, default: '' },
  kind: { type: String, default: '', index: true },     // rank | milestone
  board: { type: String, default: '', index: true },    // total|attendance|poll|spa|query ('' for milestones)
  place: { type: Number, default: 0 },                  // 1|2|3, 0 for milestones
  period: { type: String, default: '' },
  periodKey: { type: String, default: '' },

  // Copied so earn→share latency needs no join. This is the interesting one:
  // whether a card is posted the day it lands or sat on for a fortnight.
  earnedAt: { type: Date, default: null },

  // Whether the student rewrote the caption we generated before posting, and
  // how long theirs was. Speaks to whether the framing is theirs or ours.
  captionEdited: { type: Boolean, default: false },
  captionChars: { type: Number, default: 0 },

  platform: { type: String, enum: ['linkedin', 'whatsapp', 'download', 'copy', 'native'], required: true },
  at: { type: Date, default: Date.now, index: true }
});

// The two group-bys the research actually runs.
shareEventSchema.index({ board: 1, at: -1 });
shareEventSchema.index({ kind: 1, place: 1 });

export default mongoose.model('ShareEvent', shareEventSchema);
