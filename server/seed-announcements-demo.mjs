// Seeds the throwaway local demo DB so the Announcements card can be looked at.
// Run the achievements seed first (it creates the demo student), then this one.
// Never point this at the real database.
import mongoose from 'mongoose';
import Announcement from './models/Announcement.js';
import AnnouncementAck from './models/AnnouncementAck.js';

const URI = process.env.MONGO_URI;
if (!/demo/.test(URI || '')) { console.error('refusing: MONGO_URI must be a *demo* db'); process.exit(1); }
await mongoose.connect(URI);

await Promise.all([Announcement.deleteMany({}), AnnouncementAck.deleteMany({})]);

// The real first announcement — the query-review penalty rule (live 21 Aug).
const penalty = await Announcement.create({
  title: 'Query answering: new review rule from 21 Aug',
  body: [
    'Answering a fellow student’s query still earns +5 SP per query, up to the 200 SP cap. What changes today is what happens when admins review your answers:',
    '• An answer REJECTED on review (for example, pointing to the wrong FAQ) now costs −10 SP.',
    '• An answer on a query MARKED UNWORTHY costs −5 SP.',
    '• Every penalised answer also permanently uses up 5 SP of your 200 SP earning cap — it never comes back.',
    'This applies to review decisions made from 21 Aug onward, including answers already waiting in the review queue. Nothing before today is penalised.',
    'In short: answer only when you genuinely know the fix, and point to the exact FAQ that resolves the query. Quality helps you; volume can now hurt you.'
  ].join('\n'),
  postedAt: new Date('2026-08-21T06:30:00Z')
});

// An older notice, already acknowledged — shows the read/collapsed state.
const older = await Announcement.create({
  title: 'Achievement cards are live — share yours',
  body: 'The Achievements tab now generates shareable cards for your levels, ranks and the 3,600-Minute Club. Open the tab, pick an achievement, and post it to LinkedIn with one click. Every card carries a QR verification link.',
  postedAt: new Date('2026-08-13T05:00:00Z')
});

await AnnouncementAck.create({ announcementId: older._id, email: 'priya.demo@example.com', ackedAt: new Date('2026-08-14T09:00:00Z') });

console.log('seeded announcements:', penalty.title, '| (acked)', older.title);
await mongoose.disconnect();
