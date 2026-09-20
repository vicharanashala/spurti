import crypto from 'crypto';
import mongoose from 'mongoose';

// One row per hit on a public /verify/:code page. Shares tell you what students
// were willing to post; this tells you whether posting reached anyone — the
// difference between intent and effect, and the only reach measure the feature
// can produce.
//
// The people in this collection are NOT participants: they are members of the
// public who clicked a LinkedIn post. Nothing that could identify one of them
// is stored — no IP, no cookie, no persistent id (see `viewerDay` below).
const achievementViewSchema = new mongoose.Schema({
  verifyId: { type: String, required: true, index: true },
  achId: { type: String, default: '' },
  studentId: { type: String, default: '', index: true },   // whose card was viewed
  board: { type: String, default: '' },
  kind: { type: String, default: '' },
  found: { type: Boolean, default: true },                 // false = code matched nothing
  ref: { type: String, default: '' },                      // referrer HOST only, never the full URL
  uaFamily: { type: String, default: 'other' },            // coarse bucket, not the UA string
  bot: { type: Boolean, default: false, index: true },
  // Unique-visitor signal that cannot be traced back to a person: a hash of
  // (IP + user-agent) under a salt that is generated in memory and rotated
  // daily, never written down. Two hits from one device on one day collide, so
  // they can be counted once; the same device tomorrow gets an unrelated value,
  // so nobody can be followed across days. Distinct-count only — never a key.
  viewerDay: { type: String, default: '', index: true },
  at: { type: Date, default: Date.now, index: true }
});

// The salt lives only in this process's memory and dies with it, which is the
// point: there is no stored secret that could later be used to re-derive who a
// viewer was. A restart just starts a new bucket.
let salt = crypto.randomBytes(32);
let saltDay = '';
function dailySalt() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== saltDay) { salt = crypto.randomBytes(32); saltDay = today; }
  return salt;
}

export function viewerDayHash(ip, ua) {
  if (!ip) return '';
  return crypto.createHmac('sha256', dailySalt()).update(`${ip}|${ua || ''}`).digest('hex').slice(0, 16);
}

// Link unfurlers hit every shared URL to build the preview card, so without
// this every share would manufacture its own "views" and the reach numbers
// would be measuring our own og:image tags.
const BOTS = /bot|crawler|spider|facebookexternalhit|linkedinbot|slackbot|whatsapp|telegram|twitterbot|discordbot|preview|embedly|quora link preview|redditbot|applebot|bingpreview|curl|wget|python-requests|headlesschrome/i;
export function isBot(ua) { return BOTS.test(String(ua || '')); }

export function uaFamilyOf(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  if (/Android/i.test(s)) return 'android';
  if (/Windows/i.test(s)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(s)) return 'mac';
  if (/Linux/i.test(s)) return 'linux';
  return 'other';
}

export default mongoose.model('AchievementView', achievementViewSchema);
