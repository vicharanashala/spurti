import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ledgerPath = path.join(__dirname, '../../data/exports/all_students_status_sp_ledger_2026-05-25.csv');

function parseCsv(text) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i+1];
    if (quoted) {
      if (ch === '"' && next === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value.trim()); value = ''; }
    else if (ch === '\n') { row.push(value.trim()); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (value || row.length) { row.push(value.trim()); rows.push(row); }
  return rows;
}

async function run() {
  await mongoose.connect(MONGO_URI);

  console.log('🧹 Clearing old transactions, attendance and poll records...');
  await Promise.all([
    SPTransaction.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    PollRecord.deleteMany({})
  ]);

  console.log('📖 Reading CSV ledger:', ledgerPath);
  const rows = parseCsv(fs.readFileSync(ledgerPath, 'utf8').replace(/^\uFEFF/, ''));
  const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z_]/g, ''));
  console.log('Headers:', headers);

  const emailIdx = headers.indexOf('email');
  const deltaIdx = headers.indexOf('delta');
  const reasonIdx = headers.indexOf('reason');
  const datetimeIdx = headers.indexOf('datetime') !== -1 ? headers.indexOf('datetime') : headers.indexOf('date_time');

  console.log(`Indices - Email: ${emailIdx}, Delta: ${deltaIdx}, Reason: ${reasonIdx}, DateTime: ${datetimeIdx}`);

  console.log('👥 Loading students from DB...');
  const students = await Student.find({}, { _id: 1, email: 1, alternateEmail: 1, totalSp: 1 });
  const emailToStudent = new Map();
  for (const s of students) {
    emailToStudent.set(s.email.toLowerCase(), s);
    if (s.alternateEmail) {
      emailToStudent.set(s.alternateEmail.toLowerCase(), s);
    }
  }
  console.log(`Loaded ${students.length} students.`);

  // Parse rows
  const parsedRows = [];
  let unmatchedEmails = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) continue;
    const email = (row[emailIdx] || '').toLowerCase().trim();
    if (!email) continue;

    const student = emailToStudent.get(email);
    if (!student) {
      unmatchedEmails.add(email);
      continue;
    }

    const delta = parseFloat(row[deltaIdx]);
    const reason = row[reasonIdx] || '';
    const dateTime = new Date(row[datetimeIdx]);

    parsedRows.push({
      email,
      studentId: student._id,
      delta,
      reason,
      dateTime
    });
  }

  if (unmatchedEmails.size > 0) {
    console.log(`⚠️ Warning: ${unmatchedEmails.size} unmatched emails found in ledger (e.g. ${Array.from(unmatchedEmails).slice(0, 5).join(', ')}). Skipping their transactions.`);
  }

  // Sort chronologically per student to ensure running balance is computed correctly
  parsedRows.sort((a, b) => {
    if (a.email !== b.email) return a.email.localeCompare(b.email);
    return a.dateTime.getTime() - b.dateTime.getTime();
  });

  const txnsToInsert = [];
  const attendanceToInsert = [];
  const pollsToInsert = [];

  const studentBalances = new Map();
  const studentHighestSp = new Map();

  for (const row of parsedRows) {
    const email = row.email;
    const currentBalance = studentBalances.get(email) || 0;
    
    let category = 'manual';
    let sessionLabel = '';
    const reason = row.reason;

    if (reason.startsWith('Initial Spurti Points')) {
      category = 'initial';
    } else if (reason.includes('attended') || reason.includes('Required 75%')) {
      category = 'attendance';
    } else if (reason.includes('attempted') && reason.includes('poll questions')) {
      category = 'poll';
    } else if (reason.includes('chat')) {
      category = 'manual'; // Chat points are stored as manual transactions in the schema
    }

    const txId = new mongoose.Types.ObjectId();
    const balanceAfter = currentBalance + row.delta;
    studentBalances.set(email, balanceAfter);
    
    // Track highest SP
    const currentHighest = studentHighestSp.get(email) || 100;
    if (balanceAfter > currentHighest) {
      studentHighestSp.set(email, balanceAfter);
    }

    // Attempt to extract session label and details
    if (category === 'attendance') {
      const attMatch = reason.match(/^([^:]+):\s*attended\s*(\d+)\/(\d+)\s*minutes\s*\((\d+)%\)/);
      if (attMatch) {
        sessionLabel = attMatch[1].trim();
        const attendedMinutes = parseInt(attMatch[2]);
        const totalSessionMinutes = parseInt(attMatch[3]);
        const attendancePercentage = parseInt(attMatch[4]);
        const qualified = row.delta > 0;

        attendanceToInsert.push({
          email,
          studentId: row.studentId,
          sessionLabel,
          attendedMinutes,
          totalSessionMinutes,
          attendancePercentage,
          qualified,
          transactionId: txId
        });
      } else {
        // Fallback session label parse
        const parts = reason.split(':');
        sessionLabel = parts[0]?.trim() || '';
      }
    } else if (category === 'poll') {
      const pollMatch = reason.match(/^([^:]+):\s*attempted\s*(\d+)\/(\d+)\s*poll\s*questions/);
      if (pollMatch) {
        sessionLabel = pollMatch[1].trim();
        const attemptedQuestions = parseInt(pollMatch[2]);
        const totalQuestions = parseInt(pollMatch[3]);
        const missedQuestions = totalQuestions - attemptedQuestions;

        pollsToInsert.push({
          email,
          studentId: row.studentId,
          sessionLabel,
          totalQuestions,
          attemptedQuestions,
          missedQuestions,
          responses: [], // empty mock array as we don't have question-level responses in the summary
          transactionId: txId
        });
      } else {
        const parts = reason.split(':');
        sessionLabel = parts[0]?.trim() || '';
      }
    } else if (reason.includes(':')) {
      const parts = reason.split(':');
      sessionLabel = parts[0]?.trim() || '';
    }

    txnsToInsert.push({
      _id: txId,
      email,
      studentId: row.studentId,
      category,
      sessionLabel,
      deltaMode: 'absolute',
      deltaValue: row.delta,
      appliedDelta: row.delta,
      balanceAfter,
      reason,
      dateTime: row.dateTime
    });
  }

  console.log(`📤 Bulk inserting ${txnsToInsert.length} transactions...`);
  for (let i = 0; i < txnsToInsert.length; i += 2000) {
    await SPTransaction.insertMany(txnsToInsert.slice(i, i + 2000));
  }

  console.log(`📤 Bulk inserting ${attendanceToInsert.length} attendance records...`);
  for (let i = 0; i < attendanceToInsert.length; i += 2000) {
    await AttendanceRecord.insertMany(attendanceToInsert.slice(i, i + 2000));
  }

  console.log(`📤 Bulk inserting ${pollsToInsert.length} poll records...`);
  for (let i = 0; i < pollsToInsert.length; i += 2000) {
    await PollRecord.insertMany(pollsToInsert.slice(i, i + 2000));
  }

  console.log('🔄 Syncing Student profiles with final totalSp and highestSpEver...');
  const bulkStudentUpdates = [];
  for (const [email, finalSp] of studentBalances.entries()) {
    const student = emailToStudent.get(email);
    if (!student) continue;

    const highestSp = studentHighestSp.get(email) || 100;

    bulkStudentUpdates.push({
      updateOne: {
        filter: { _id: student._id },
        update: {
          $set: {
            totalSp: finalSp,
            highestSpEver: highestSp
          }
        }
      }
    });
  }

  if (bulkStudentUpdates.length > 0) {
    console.log(`Updating ${bulkStudentUpdates.length} student records...`);
    await Student.bulkWrite(bulkStudentUpdates);
  }

  console.log('\n🎉 Rebuild complete from CSV Ledger!');
  console.log(`   Transactions: ${await SPTransaction.countDocuments()}`);
  console.log(`   Attendance records: ${await AttendanceRecord.countDocuments()}`);
  console.log(`   Poll records: ${await PollRecord.countDocuments()}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Error during rebuild from CSV:', error);
  await mongoose.disconnect();
  process.exit(1);
});
