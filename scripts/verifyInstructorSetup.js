import mongoose from 'mongoose';
import { MONGO_URI } from '../server/config.js';
import Cohort from '../server/models/Cohort.js';
import Instructor from '../server/models/Instructor.js';
import Student from '../server/models/Student.js';
import Session from '../server/models/Session.js';

async function verify() {
  const mongoUri = process.env.MONGO_URI || MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';
  let failedCount = 0;
  const results = [];

  function recordResult(checkName, pass, details = '') {
    if (!pass) failedCount++;
    results.push({ checkName, pass, details });
    const mark = pass ? '[PASS]' : '[FAIL]';
    console.log(`${mark} ${checkName}${details ? ` (${details})` : ''}`);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for verification.\n');

    // Fetch collections and records
    const cohort = await Cohort.findOne({ name: 'Summership 2026' });
    const instructor = await Instructor.findOne({ email: 'instructor@spurti.in' });
    const totalStudents = await Student.countDocuments();
    const totalSessions = await Session.countDocuments();

    // Check 1: Cohort "Summership 2026" exists in cohorts collection
    recordResult('Cohort "Summership 2026" exists in cohorts collection', !!cohort);

    // Check 2: Cohort has cohortType: 'summership' and year: 2026
    const check2 = !!cohort && cohort.cohortType === 'summership' && cohort.year === 2026;
    recordResult("Cohort has cohortType: 'summership' and year: 2026", check2);

    // Check 3: Cohort has a valid instructorId set (not null)
    const check3 = !!cohort && !!cohort.instructorId;
    recordResult('Cohort has a valid instructorId set (not null)', check3);

    // Check 4: Cohort studentIds array length equals students collection count
    const check4 = !!cohort && Array.isArray(cohort.studentIds) && cohort.studentIds.length === totalStudents;
    recordResult('Cohort studentIds array length equals students collection count', check4, `array: ${cohort?.studentIds?.length ?? 0}, total: ${totalStudents}`);

    // Check 5: Cohort sessionIds array length equals sessions collection count
    const check5 = !!cohort && Array.isArray(cohort.sessionIds) && cohort.sessionIds.length === totalSessions;
    recordResult('Cohort sessionIds array length equals sessions collection count', check5, `array: ${cohort?.sessionIds?.length ?? 0}, total: ${totalSessions}`);

    // Check 6: Instructor account exists with email "instructor@spurti.in"
    recordResult('Instructor account exists with email "instructor@spurti.in"', !!instructor);

    // Check 7: Instructor has role: 'instructor'
    const check7 = !!instructor && instructor.role === 'instructor';
    recordResult("Instructor has role: 'instructor'", check7);

    // Check 8: Instructor cohortId matches the cohort _id
    const check8 = !!instructor && !!cohort && String(instructor.cohortId) === String(cohort._id);
    recordResult('Instructor cohortId matches the cohort _id', check8);

    // Check 9: All students in students collection have cohortId set
    const unassignedStudentsCount = await Student.countDocuments({
      $or: [{ cohortId: null }, { cohortId: { $exists: false } }]
    });
    recordResult('All students in students collection have cohortId set', unassignedStudentsCount === 0, `unassigned: ${unassignedStudentsCount}`);

    // Check 10: All students in students collection have role: 'student'
    const nonStudentRoleCount = await Student.countDocuments({ role: { $ne: 'student' } });
    recordResult("All students in students collection have role: 'student'", nonStudentRoleCount === 0, `non-student roles: ${nonStudentRoleCount}`);

    // Check 11: All sessions in sessions collection have cohortId set
    const unassignedSessionsCount = await Session.countDocuments({
      $or: [{ cohortId: null }, { cohortId: { $exists: false } }]
    });
    recordResult('All sessions in sessions collection have cohortId set', unassignedSessionsCount === 0, `unassigned: ${unassignedSessionsCount}`);

    // Check 12: All sessions in sessions collection have instructorId set
    const unassignedSessionInstructorCount = await Session.countDocuments({
      $or: [{ instructorId: null }, { instructorId: { $exists: false } }]
    });
    recordResult('All sessions in sessions collection have instructorId set', unassignedSessionInstructorCount === 0, `unassigned: ${unassignedSessionInstructorCount}`);

    console.log('\n----------------------------------------');
    if (failedCount === 0) {
      console.log('ALL CHECKS PASSED — Infrastructure ready. Proceed to dashboard build.');
    } else {
      console.log(`${failedCount} CHECKS FAILED — Do not proceed. Fix issues above and re-run seed script.`);
    }

  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

verify();
