import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import {
  KNOWN_SESSIONS,
  applySessionForStudents,
  ensureInitialTransaction,
  normalizeEmail,
  readStudents,
  recalculateStudentSp
} from './lib/ingestion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const uploadsDir = path.join(rootDir, 'data', 'uploads');

async function findExisting(row) {
  return Student.findOne({
    $or: [
      { email: row.email },
      { alternateEmail: row.email },
      ...(row.alternateEmail ? [{ email: row.alternateEmail }, { alternateEmail: row.alternateEmail }] : [])
    ]
  });
}

async function run() {
  const csvArg = process.argv[2];
  if (!csvArg) {
    console.error('Usage: npm run sync-students -- path/to/student-list.csv');
    process.exit(1);
  }

  const rows = readStudents(path.resolve(csvArg));
  await mongoose.connect(MONGO_URI);

  const stats = {
    rows: rows.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    initialTransactions: 0,
    attendanceBackfilled: 0,
    pollsBackfilled: 0,
    chatsBackfilled: 0,
    skippedExistingTransactions: 0,
    excused: 0,
    reactivated: 0,
    errors: []
  };
  const syncedIds = new Set();

  for (const row of rows) {
    if (!row.email.includes('@')) {
      stats.skipped++;
      stats.errors.push(`Row ${row.rowNumber}: invalid email`);
      continue;
    }
    if (!row.internshipStartDate) {
      stats.skipped++;
      stats.errors.push(`Row ${row.rowNumber}: missing/invalid internshipStartDate`);
      continue;
    }

    const existing = await findExisting(row);
    if (existing) {
      existing.name = row.name || existing.name;
      existing.alternateEmail = row.alternateEmail || existing.alternateEmail;
      existing.internshipStartDate = row.internshipStartDate || existing.internshipStartDate;
      existing.internshipEndDate = row.internshipEndDate || existing.internshipEndDate;
      if (existing.status === 'excused') stats.reactivated++;
      const existingStart = existing.internshipStartDate ? new Date(existing.internshipStartDate) : null;
      existing.status = (existingStart && existingStart > new Date()) ? 'yet to onboard' : 'active';
      existing.excusedAt = null;
      existing.excusedReason = '';
      await existing.save();
      syncedIds.add(String(existing._id));
      stats.updated++;
      continue;
    }

    const start = row.internshipStartDate ? new Date(row.internshipStartDate) : null;
    const student = await Student.create({
      name: row.name || row.email,
      email: normalizeEmail(row.email),
      alternateEmail: normalizeEmail(row.alternateEmail),
      internshipStartDate: row.internshipStartDate,
      internshipEndDate: row.internshipEndDate,
      status: (start && start > new Date()) ? 'yet to onboard' : 'active',
      excusedAt: null,
      excusedReason: '',
      totalSp: 100
    });
    await ensureInitialTransaction(student, stats);
    syncedIds.add(String(student._id));
    stats.inserted++;
  }

  const excusedAt = new Date();
  const excusedResult = await Student.updateMany(
    { _id: { $nin: [...syncedIds] }, status: { $ne: 'excused' } },
    {
      $set: {
        status: 'excused',
        excusedAt,
        excusedReason: `Not present in synced roster ${path.basename(csvArg)}`
      }
    }
  );
  stats.excused = excusedResult.modifiedCount || 0;

  const syncedStudents = await Student.find({ _id: { $in: [...syncedIds] } }).sort({ name: 1 });
  for (const config of KNOWN_SESSIONS) {
    await applySessionForStudents(config, syncedStudents, uploadsDir, stats);
  }
  for (const student of syncedStudents) await recalculateStudentSp(student.email);

  console.log(JSON.stringify({ ...stats, errors: stats.errors.slice(0, 20) }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
