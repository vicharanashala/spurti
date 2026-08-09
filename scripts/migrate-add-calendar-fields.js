import mongoose from 'mongoose';
import 'dotenv/config';
import Student from '../server/models/Student.js';
import { MONGO_URI } from '../server/config.js';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to Mongo');
  const res = await Student.updateMany({ jscalendar: { $exists: false } }, { $set: { jscalendar: { google: { refreshToken: '', tokenExpiry: null } } } });
  console.log('Updated', res.nModified || res.modifiedCount || 0, 'students');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
