import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MONGO_URI } from './server/config.js';
import Student from './server/models/Student.js';
import SPTransaction from './server/models/SPTransaction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ledgerPath = path.join(__dirname, 'data', 'exports', 'all_students_status_sp_ledger_2026-05-25.csv');

function parseCsv(text) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i+1];
    if (quoted) {
      if (ch === '"' && next === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value.trim()); value = ''; }
    else if (ch === '\n') { row.push(value.trim()); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (value) { row.push(value.trim()); rows.push(row); }
  return rows;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  
  const rows = parseCsv(fs.readFileSync(ledgerPath, 'utf8').replace(/^\uFEFF/, ''));
  const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  console.log('Headers:', headers);
  
  const emailIdx = headers.indexOf('email');
  const deltaIdx = headers.indexOf('delta');
  const reasonIdx = headers.indexOf('reason');
  const datetimeIdx = headers.indexOf('datetime');
  
  const students = await Student.find({}, { _id: 1, email: 1 });
  const emailToId = new Map(students.map(s => [s.email.toLowerCase(), s._id]));
  console.log('Students loaded:', students.length);
  
  const existing = await SPTransaction.countDocuments();
  console.log('Existing SP transactions:', existing);
  
  const batch = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const email = (row[emailIdx] || '').toLowerCase().trim();
    const studentId = emailToId.get(email);
    if (!studentId) continue;
    
    const delta = parseFloat(row[deltaIdx]);
    const reason = row[reasonIdx] || '';
    const dt = new Date(row[datetimeIdx]);
    
    let category = 'manual';
    if (reason.includes('attendance') || reason.includes('attended')) category = 'attendance';
    else if (reason.includes('poll')) category = 'poll';
    else if (reason.includes('Initial')) category = 'initial';
    
    if (category === 'initial') continue;
    
    batch.push({
      email,
      studentId,
      category,
      deltaMode: 'absolute',
      deltaValue: delta,
      appliedDelta: delta,
      balanceAfter: 0,
      reason,
      dateTime: dt
    });
  }
  
  const balances = new Map();
  for (const tx of batch) {
    const bal = (balances.get(tx.email) || 100) + tx.appliedDelta;
    balances.set(tx.email, bal);
    tx.balanceAfter = bal;
  }
  
  const existingTxs = await SPTransaction.find({}, { email: 1, reason: 1, dateTime: 1 }).lean();
  const existingKeys = new Set(existingTxs.map(t => 
    t.email.toLowerCase() + '|' + t.reason + '|' + new Date(t.dateTime).toISOString()
  ));
  
  const newBatch = batch.filter(tx => 
    !existingKeys.has(tx.email.toLowerCase() + '|' + tx.reason + '|' + tx.dateTime.toISOString())
  );
  
  console.log('New transactions to insert:', newBatch.length);
  
  for (let i = 0; i < newBatch.length; i += 1000) {
    await SPTransaction.insertMany(newBatch.slice(i, i + 1000));
    console.log('Inserted', Math.min(i + 1000, newBatch.length), '/', newBatch.length);
  }
  
  const total = await SPTransaction.countDocuments();
  console.log('Total SP transactions in DB:', total);
  
  await mongoose.disconnect();
}

run().catch(async err => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});