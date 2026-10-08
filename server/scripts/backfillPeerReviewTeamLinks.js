import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import PeerReviewSubmission from '../models/PeerReviewSubmission.js';

function computeFields(prLink) {
  const raw = prLink.trim().toLowerCase();
  let teamLink, resolvedPrUrl;
  if (/\/pull[s]?\/(\d+)/.test(raw)) {
    const num = raw.match(/\/pull[s]?\/(\d+)/)[1];
    teamLink = 'pr-' + num;
    resolvedPrUrl = `https://github.com/vicharanashala/crowd-source-faq/pull/${num}`;
  } else if (/^\d+$/.test(raw)) {
    teamLink = 'pr-' + raw;
    resolvedPrUrl = `https://github.com/vicharanashala/crowd-source-faq/pull/${raw}`;
  } else if (/team-/.test(raw)) {
    const parts = raw.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '').replace(/[?#].*$/, '').split('/');
    teamLink = parts[parts.length - 1];
    resolvedPrUrl = raw.startsWith('http') ? raw : `https://github.com/vicharanashala/${teamLink}`;
  } else if (/^[0-9a-f]{10,}$/.test(raw)) {
    teamLink = 'team-' + raw;
    resolvedPrUrl = `https://github.com/vicharanashala/team-${raw}`;
  } else {
    teamLink = raw.replace(/\/+$/, '').replace(/[?#].*$/, '');
    resolvedPrUrl = raw.startsWith('http') ? raw : `https://github.com/vicharanashala/${raw}`;
  }
  return { teamLink, resolvedPrUrl };
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const all = await PeerReviewSubmission.find({ $or: [{ teamLink: null }, { resolvedPrUrl: null }] }).lean();
  console.log(`Found ${all.length} submissions missing teamLink or resolvedPrUrl`);

  let updated = 0;
  for (const sub of all) {
    const { teamLink, resolvedPrUrl } = computeFields(sub.prLink);
    await PeerReviewSubmission.updateOne({ _id: sub._id }, { $set: { teamLink, resolvedPrUrl } });
    updated++;
  }

  console.log(`Backfilled ${updated} submissions`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
