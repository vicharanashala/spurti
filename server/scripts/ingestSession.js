import path from 'path';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import { applySessionForStudents, session } from './lib/ingestion.js';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = value;
  }
  return out;
}

function usage() {
  console.error(`Usage:
npm run ingest-session -- --label "22 May Morning" --date 2026-05-22 --type morning --attendance data/uploads/2026-05-22/attendance.csv --poll data/uploads/2026-05-22/poll.csv --minutes 120

Required: --label, --date
At least one of: --attendance, --poll
Optional: --type, --start, --end, --minutes`);
}

async function run() {
  const options = args(process.argv.slice(2));
  if (!options.label || !options.date || (!options.attendance && !options.poll)) {
    usage();
    process.exit(1);
  }

  const start = options.start || `${options.date}T09:00:00`;
  const end = options.end || `${options.date}T11:00:00`;
  const config = session(
    options.label,
    options.date,
    options.type || '',
    start,
    end,
    Number(options.minutes || 0),
    options.attendance ? path.resolve(options.attendance) : null,
    options.poll ? path.resolve(options.poll) : null
  );

  await mongoose.connect(MONGO_URI);
  const students = await Student.find({ status: { $ne: 'excused' } }).sort({ name: 1 });
  const stats = {
    studentsConsidered: students.length,
    attendanceBackfilled: 0,
    pollsBackfilled: 0,
    skippedExistingTransactions: 0
  };
  await applySessionForStudents(config, students, process.cwd(), stats);
  console.log(JSON.stringify(stats, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
