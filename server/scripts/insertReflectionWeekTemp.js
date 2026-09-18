#!/usr/bin/env node
import mongoose from 'mongoose';
import ReflectionWeek from '../models/ReflectionWeek.js';

console.log('insertReflectionWeekTemp script starting');

// One-off helper to insert a temporary ReflectionWeek into the test DB.
// Intended to be run locally and not committed as a permanent test harness.

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership_test';

async function main() {
  console.log('Using MONGO_URI:', MONGO_URI);
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB');
  } catch (connErr) {
    console.error('MongoDB connection failed:', connErr && connErr.message ? connErr.message : connErr);
    process.exitCode = 2;
    return;
  }

  try {
    const now = new Date();
    const submissionStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour before
    const submissionEnd = new Date(now.getTime() + 60 * 60 * 1000);   // 1 hour after
    const votingStart = new Date(submissionEnd.getTime()); // exactly submission end
    const votingEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours after now

    const weekLabel = 'reflection-mvp-test-20260814';

    // Ensure we do not modify existing non-test docs — bail if the label exists.
    const exists = await ReflectionWeek.findOne({ weekLabel }).lean();
    if (exists) {
      console.log('ReflectionWeek already exists; aborting insertion.');
      console.log(JSON.stringify(exists, null, 2));
      await mongoose.disconnect();
      process.exit(0);
    }

    const doc = await ReflectionWeek.create({
      weekLabel,
      submissionStart,
      submissionEnd,
      votingStart,
      votingEnd,
      status: 'active',
      finalizedAt: null
    });

    // Print the created document so the user can verify.
    console.log('Inserted ReflectionWeek:');
    console.log(JSON.stringify(doc.toObject ? doc.toObject() : doc, null, 2));
  } catch (err) {
    console.error('Failed to insert ReflectionWeek:', err);
    process.exitCode = 2;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();
