import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value); value = ''; }
    else if (ch === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  return new Date(Number(m[3]), months[m[2].slice(0, 3).toLowerCase()], Number(m[1]), 9, 0, 0);
}

function headerIndex(headers, names) {
  const normalized = headers.map(h => String(h || '').trim().toLowerCase());
  for (const name of names) {
    const index = normalized.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

function readStudents(csvPath) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) return [];
  const headers = rows[0];
  const nameIndex = headerIndex(headers, ['name', 'student name']);
  const emailIndex = headerIndex(headers, ['email', 'email address']);
  const altIndex = headerIndex(headers, ['emailAlt', 'alternateEmail', 'alternate email', 'email alt']);
  const startIndex = headerIndex(headers, ['internshipStartDate', 'internship start date', 'startDate']);
  const endIndex = headerIndex(headers, ['internshipEndDate', 'internship end date', 'endDate']);

  if (emailIndex < 0) throw new Error('CSV must contain an email column');

  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    name: String(row[nameIndex] || row[emailIndex] || '').trim(),
    email: normalizeEmail(row[emailIndex]),
    alternateEmail: altIndex >= 0 ? normalizeEmail(row[altIndex]) : '',
    internshipStartDate: startIndex >= 0 ? parseDate(row[startIndex]) : null,
    internshipEndDate: endIndex >= 0 ? parseDate(row[endIndex]) : null
  })).filter(row => row.email);
}

async function createInitialTransaction(student) {
  const exists = await SPTransaction.exists({ email: student.email, category: 'initial' });
  if (exists) return false;
  await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'initial',
    sessionLabel: '',
    deltaMode: 'absolute',
    deltaValue: 100,
    appliedDelta: 100,
    balanceAfter: 100,
    reason: 'Initial Spurti Points credited by system on onboarding.',
    dateTime: student.internshipStartDate
  });
  return true;
}

async function run() {
  const csvArg = process.argv[2];
  if (!csvArg) {
    console.error('Usage: npm run add-students -- path/to/student-list.csv');
    process.exit(1);
  }

  const csvPath = path.resolve(csvArg);
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const rows = readStudents(csvPath);
  await mongoose.connect(MONGO_URI);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let initialTransactions = 0;
  const errors = [];

  for (const row of rows) {
    if (!row.email.includes('@')) {
      skipped++;
      errors.push(`Row ${row.rowNumber}: invalid email`);
      continue;
    }
    if (!row.internshipStartDate) {
      skipped++;
      errors.push(`Row ${row.rowNumber}: missing/invalid internshipStartDate`);
      continue;
    }

    const existing = await Student.findOne({
      $or: [
        { email: row.email },
        { alternateEmail: row.email },
        ...(row.alternateEmail ? [{ email: row.alternateEmail }, { alternateEmail: row.alternateEmail }] : [])
      ]
    });

    if (existing) {
      existing.name = row.name || existing.name;
      existing.alternateEmail = row.alternateEmail || existing.alternateEmail;
      existing.internshipStartDate = row.internshipStartDate || existing.internshipStartDate;
      existing.internshipEndDate = row.internshipEndDate || existing.internshipEndDate;
      const existingStart = existing.internshipStartDate ? new Date(existing.internshipStartDate) : null;
      existing.status = (existingStart && existingStart > new Date()) ? 'yet to onboard' : 'active';
      existing.excusedAt = null;
      existing.excusedReason = '';
      await existing.save();
      updated++;
      continue;
    }

    const start = row.internshipStartDate ? new Date(row.internshipStartDate) : null;
    const student = await Student.create({
      name: row.name || row.email,
      email: row.email,
      alternateEmail: row.alternateEmail,
      internshipStartDate: row.internshipStartDate,
      internshipEndDate: row.internshipEndDate,
      status: (start && start > new Date()) ? 'yet to onboard' : 'active',
      excusedAt: null,
      excusedReason: '',
      totalSp: 100
    });
    inserted++;
    if (await createInitialTransaction(student)) initialTransactions++;
  }

  console.log(JSON.stringify({
    file: csvPath,
    rows: rows.length,
    inserted,
    updated,
    skipped,
    initialTransactions,
    errors: errors.slice(0, 20)
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
