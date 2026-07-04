import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { MONGO_URI } from '../server/config.js';
import Cohort from '../server/models/Cohort.js';
import Instructor from '../server/models/Instructor.js';
import Student from '../server/models/Student.js';
import Session from '../server/models/Session.js';

async function runSeed() {
  let cohortId = null;
  let instructorId = null;
  let studentsMigratedCount = 0;
  let sessionsMigratedCount = 0;

  try {
    const mongoUri = process.env.MONGO_URI || MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for seed execution.');

    // STEP 1 — Create the Cohort
    try {
      let cohort = await Cohort.findOne({ cohortType: 'summership', year: 2026 });
      if (cohort) {
        cohortId = cohort._id;
        console.log('Cohort already exists — skipping creation');
      } else {
        cohort = await Cohort.create({
          name: 'Summership 2026',
          cohortType: 'summership',
          year: 2026,
          startDate: new Date('2026-05-18'),
          endDate: new Date('2026-07-06'),
          isActive: true,
          instructorId: null,
          studentIds: [],
          sessionIds: []
        });
        cohortId = cohort._id;
        console.log(`Cohort created with id: ${cohortId}`);
      }
    } catch (step1Err) {
      console.error('STEP 1 Error:', step1Err.message);
      throw step1Err;
    }

    // STEP 2 — Create the Instructor Account
    try {
      let instructor = await Instructor.findOne({ email: 'instructor@spurti.in' });
      if (instructor) {
        instructorId = instructor._id;
        console.log('Instructor already exists — skipping creation');
      } else {
        instructor = await Instructor.create({
          name: 'Spurti Instructor',
          email: 'instructor@spurti.in',
          passwordHash: bcrypt.hashSync('Spurti@2026', 10),
          role: 'instructor',
          cohortId: cohortId,
          isActive: true
        });
        instructorId = instructor._id;
        console.log(`Instructor created with id: ${instructorId}`);
      }
    } catch (step2Err) {
      console.error('STEP 2 Error:', step2Err.message);
      throw step2Err;
    }

    // STEP 3 — Link Instructor to Cohort
    try {
      await Cohort.updateOne({ _id: cohortId }, { $set: { instructorId: instructorId } });
      console.log('Cohort linked to instructor successfully');
    } catch (step3Err) {
      console.error('STEP 3 Error:', step3Err.message);
      throw step3Err;
    }

    // STEP 4 — Migrate All Existing Students
    try {
      const filter = { $or: [{ cohortId: null }, { cohortId: { $exists: false } }] };
      const unassignedStudents = await Student.find(filter).select('_id');
      studentsMigratedCount = unassignedStudents.length;

      if (studentsMigratedCount > 0) {
        await Student.bulkWrite([
          {
            updateMany: {
              filter: filter,
              update: { $set: { cohortId: cohortId, role: 'student' } }
            }
          }
        ]);
      }

      const allStudentIds = (await Student.find({ cohortId: cohortId }).select('_id')).map(s => s._id);
      await Cohort.updateOne({ _id: cohortId }, { $set: { studentIds: allStudentIds } });

      console.log(`Migrated ${studentsMigratedCount} students to Summership 2026 cohort`);
    } catch (step4Err) {
      console.error('STEP 4 Error:', step4Err.message);
      throw step4Err;
    }

    // STEP 5 — Migrate All Existing Sessions
    try {
      const filter = { $or: [{ cohortId: null }, { cohortId: { $exists: false } }] };
      const unassignedSessions = await Session.find(filter).select('_id');
      sessionsMigratedCount = unassignedSessions.length;

      if (sessionsMigratedCount > 0) {
        await Session.bulkWrite([
          {
            updateMany: {
              filter: filter,
              update: { $set: { cohortId: cohortId, instructorId: instructorId } }
            }
          }
        ]);
      }

      const allSessionIds = (await Session.find({ cohortId: cohortId }).select('_id')).map(s => s._id);
      await Cohort.updateOne({ _id: cohortId }, { $set: { sessionIds: allSessionIds } });

      console.log(`Migrated ${sessionsMigratedCount} sessions to Summership 2026 cohort`);
    } catch (step5Err) {
      console.error('STEP 5 Error:', step5Err.message);
      throw step5Err;
    }

    console.log('════════════════════════════════════════');
    console.log('SEED COMPLETE — Summership 2026 Summary:');
    console.log(`  Cohort ID     : ${cohortId}`);
    console.log(`  Instructor ID : ${instructorId}`);
    console.log(`  Students      : ${studentsMigratedCount} migrated`);
    console.log(`  Sessions      : ${sessionsMigratedCount} migrated`);
    console.log('════════════════════════════════════════');

  } catch (err) {
    console.error('Seed process failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runSeed();
