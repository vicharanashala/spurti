import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Student from './models/Student.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const studentsDataPath = path.join(rootDir, 'data', 'students.json');

export async function connectToDatabase(uri, env = process.env) {
  if (shouldUseMemoryFallback(uri, env)) {
    const memoryServer = await MongoMemoryServer.create();
    const memoryUri = memoryServer.getUri();
    await mongoose.connect(memoryUri);
    await seedStudentsIfNeeded();
    return { mongoose, memoryServer };
  }

  await mongoose.connect(uri);
  return { mongoose };
}

export function shouldUseMemoryFallback(uri, env = process.env) {
  const explicitUri = env.MONGO_URI || env.mongoUri;
  if (explicitUri) {
    return false;
  }

  return /mongodb:\/\/127\.0\.0\.1:27017|mongodb:\/\/localhost:27017/.test(uri);
}

export function buildSeedStudentDocs(rows = []) {
  return rows
    .filter((row) => normalizeEmail(row?.email))
    .map((row) => ({
      name: row.name || row.email,
      email: normalizeEmail(row.email),
      alternateEmail: normalizeEmail(row.alternateEmail || row.email),
      internshipStartDate: new Date('2026-05-15T00:00:00.000Z'),
      internshipEndDate: null,
      status: 'active',
      totalSp: Number(row.totalSp || 100),
      highestSpEver: Number(row.totalSp || 100),
      level: 1,
      trophyLeague: 'Bronze II',
      legendBadgeUnlocked: false,
      leaderboardGroup: ''
    }));
}

export async function seedStudentsIfNeeded() {
  try {
    const existingCount = await Student.countDocuments();
    if (existingCount > 0) return 0;

    if (!fs.existsSync(studentsDataPath)) return 0;

    const raw = fs.readFileSync(studentsDataPath, 'utf8').replace(/^\uFEFF/, '');
    const rows = JSON.parse(raw);
    const docs = buildSeedStudentDocs(rows);

    if (!docs.length) return 0;

    await Student.bulkWrite(docs.map((doc) => ({
      updateOne: {
        filter: { email: doc.email },
        update: { $set: doc },
        upsert: true
      }
    })));
    return docs.length;
  } catch (error) {
    console.error('Failed to seed demo students:', error?.message || error);
    return 0;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}
