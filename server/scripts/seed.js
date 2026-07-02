import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { MONGO_URI, SESSION_LABELS } from '../config.js';
import Student from '../models/Student.js';
import { normalizeEmail } from '../utils/email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const dataPath = path.join(rootDir, 'data', 'students.json');

function sessionObject(value = {}) {
  const sessions = {};
  for (const label of SESSION_LABELS) sessions[label] = Number(value[label] || 0);
  return sessions;
}

async function run() {
  const raw = fs.readFileSync(dataPath, 'utf8').replace(/^\uFEFF/, '');
  const rows = JSON.parse(raw);

  await mongoose.connect(MONGO_URI);
  await Student.deleteMany({});

  const docs = rows
    .filter((row) => normalizeEmail(row.email))
    .map((row) => ({
      name: row.name || row.email,
      email: normalizeEmail(row.email),
      alternateEmail: normalizeEmail(row.alternateEmail || row.email),
      sessions: sessionObject(row.sessions),
      activities: row.activities || [],
      activityItems: row.activityItems || '',
      activityMatched: row.activityMatched || ''
    }));

  await Student.bulkWrite(docs.map((doc) => ({
    updateOne: {
      filter: { email: doc.email },
      update: { $set: doc },
      upsert: true
    }
  })));
  console.log(`Seeded ${docs.length} students into ${MONGO_URI}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
