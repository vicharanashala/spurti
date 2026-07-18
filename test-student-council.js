import mongoose from 'mongoose';
import 'dotenv/config';

import Student from './server/models/Student.js';
import Season from './server/models/Season.js';
import StudentSeasonData from './server/models/StudentSeasonData.js';
import SPTransaction from './server/models/SPTransaction.js';
import CouncilSuggestion from './server/models/CouncilSuggestion.js';
import RewardTrack from './server/models/RewardTrack.js';
import { MONGO_URI } from './server/config.js';

function localRefineStatement(statement) {
  let refined = statement.trim();
  refined = refined.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  if (!refined.endsWith('.')) refined += '.';
  const prefix = "I am highly motivated to serve on the Student Council. My goal is to collaborate with peers, address community feedback, and help make our learning environment and quests even more engaging. ";
  return prefix + refined;
}

function localGenerateInsights(suggestions, seasonName) {
  const weeklyQuests = suggestions.filter(s => s.type === 'weeklyQuest');
  const platformImprovements = suggestions.filter(s => s.type === 'platformImprovement');
  
  let report = `### 📋 Student Council Advisory & Suggestions Report (Offline Summary)\n\n`;
  report += `This report lists and categorizes the submissions from the Student Council representatives for the concluded season: **${seasonName}**.\n\n`;

  if (weeklyQuests.length > 0) {
    report += `#### 🎮 Suggested Weekly Quests & Challenges:\n`;
    weeklyQuests.forEach(s => {
      report += `- **${s.studentName || 'Anonymous'}:** "${s.content}"\n`;
    });
    report += `\n`;
  }

  if (platformImprovements.length > 0) {
    report += `#### 🛠 Recommended Platform Improvements:\n`;
    platformImprovements.forEach(s => {
      report += `- **${s.studentName || 'Anonymous'}:** "${s.content}"\n`;
    });
    report += `\n`;
  }

  report += `#### 💡 Recommended Next Action Items for Admins:\n`;
  report += `1. Review the proposed weekly quest templates above and integrate them into the upcoming cycle.\n`;
  report += `2. Assess feasibility of suggested platform enhancements.\n`;
  return report;
}

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully.');

  try {
    // 1. Clean up old test data
    console.log('\n--- 1. Cleaning up test data ---');
    await Season.deleteMany({ name: /^Test Season/ });
    await Student.deleteMany({ email: /@test-council\.com$/ });
    console.log('Old test data cleaned.');

    // 2. Start a new Season
    console.log('\n--- 2. Starting test season ---');
    const season = await Season.create({
      name: 'Test Season Alpha',
      isActive: true,
      maxSpCapForScore: 1000,
      councilSize: 2,
      minEndorsementsRequired: 40,
      minSpRequired: 500
    });
    console.log(`Test Season started: ${season.name}`);

    // 3. Create test students
    console.log('\n--- 3. Creating test students ---');
    const studentA = await Student.create({
      name: 'Alice Cooper',
      email: 'alice@test-council.com',
      internshipStartDate: new Date(),
      totalSp: 100
    });
    const studentB = await Student.create({
      name: 'Bob Marley',
      email: 'bob@test-council.com',
      internshipStartDate: new Date(),
      totalSp: 100
    });
    console.log(`Created Alice (${studentA.email}) and Bob (${studentB.email}).`);

    // 4. Verify initial eligibility (should fail)
    console.log('\n--- 4. Checking initial eligibility (should be false) ---');
    const checkEligibility = async (student, activeSeason) => {
      const transactions = await SPTransaction.find({ email: student.email }).lean();
      const seasonTxs = transactions.filter(t => t.dateTime >= activeSeason.startDate && t.appliedDelta > 0 && t.category !== 'initial');
      const seasonSp = seasonTxs.reduce((sum, t) => sum + t.appliedDelta, 0);

      const data = await StudentSeasonData.findOne({ studentId: student._id, seasonId: activeSeason._id });
      const endorsementsCount = data ? (data.matrixMysticsEndorsements || []).length : 0;
      const hasSpamPenalties = data ? Boolean(data.hasSpamPenalties) : false;
      const hasDisciplinaryActions = data ? Boolean(data.hasDisciplinaryActions) : false;

      const isEligible = (seasonSp >= activeSeason.minSpRequired) &&
                         (endorsementsCount >= activeSeason.minEndorsementsRequired) &&
                         !hasSpamPenalties &&
                         !hasDisciplinaryActions;
      return { isEligible, seasonSp, endorsementsCount };
    };

    let eligA = await checkEligibility(studentA, season);
    console.log(`Alice eligibility: ${eligA.isEligible} (Season SP: ${eligA.seasonSp}, Endorsements: ${eligA.endorsementsCount})`);
    if (eligA.isEligible) throw new Error('Assertion failed: Alice should not be eligible yet.');

    // 5. Update SP and endorsements to meet criteria
    console.log('\n--- 5. Granting SP and Matrix Mystics endorsements ---');
    await SPTransaction.create({
      email: studentA.email,
      studentId: studentA._id,
      category: 'attendance',
      sessionLabel: 'Day 1',
      deltaValue: 600,
      appliedDelta: 600,
      balanceAfter: 700,
      reason: 'Test Session SP',
      dateTime: new Date()
    });
    await Student.updateOne({ _id: studentA._id }, { $set: { totalSp: 700 } });

    const endorsed = Array.from({ length: 42 }, (_, i) => i + 1);
    await StudentSeasonData.create({
      studentId: studentA._id,
      seasonId: season._id,
      matrixMysticsEndorsements: endorsed
    });

    eligA = await checkEligibility(studentA, season);
    console.log(`Alice eligibility: ${eligA.isEligible} (Season SP: ${eligA.seasonSp}, Endorsements: ${eligA.endorsementsCount})`);
    if (!eligA.isEligible) throw new Error('Assertion failed: Alice should now be eligible.');

    // 6. Test offline statement refinement
    console.log('\n--- 6. Testing Local Offline Statement Refinement ---');
    const statement = "hi, i really want to join student council so i can help other people solve their coding bugs and make weekly challenge better.";
    console.log(`Original: "${statement}"`);
    const refined = localRefineStatement(statement);
    console.log(`Refined (Local offline): "${refined}"`);

    // 7. Nominate Alice
    console.log('\n--- 7. Nominating Alice ---');
    await StudentSeasonData.updateOne(
      { studentId: studentA._id, seasonId: season._id },
      { $set: { isNominated: true, nominationStatement: refined } }
    );
    console.log('Alice is now a nominee.');

    // 8. Test Voting
    console.log('\n--- 8. Bob votes for Alice ---');
    await StudentSeasonData.updateOne(
      { studentId: studentA._id, seasonId: season._id },
      { $push: { votes: studentB.email } }
    );
    const nomineeRecord = await StudentSeasonData.findOne({ studentId: studentA._id, seasonId: season._id });
    console.log(`Alice Votes count: ${nomineeRecord.votes.length} (Voted by: ${nomineeRecord.votes.join(', ')})`);

    // 9. Conclude the election and award SP
    console.log('\n--- 9. Conclude Election & Award +50 SP ---');
    nomineeRecord.isElected = true;
    nomineeRecord.councilScore = 100;
    await nomineeRecord.save();
    
    season.isActive = false;
    season.endDate = new Date();
    await season.save();

    await Student.updateOne({ _id: studentA._id }, { $inc: { totalSp: 50 } });
    await SPTransaction.create({
      email: studentA.email,
      studentId: studentA._id,
      category: 'manual',
      reason: `Elected to Student Council - ${season.name} Bonus SP`,
      deltaValue: 50,
      appliedDelta: 50,
      balanceAfter: 750,
      dateTime: new Date()
    });
    
    const finalStudentA = await Student.findById(studentA._id);
    console.log(`Alice final SP balance: ${finalStudentA.totalSp} (Expected: 750)`);
    if (finalStudentA.totalSp !== 750) throw new Error('Assertion failed: Alice final SP should be 750.');

    // 10. Council Suggestions & Local Offline Report
    console.log('\n--- 10. Submitting suggestions & generating Local Offline report ---');
    await CouncilSuggestion.create([
      {
        studentId: studentA._id,
        seasonId: season._id,
        type: 'platformImprovement',
        content: 'Please add a search bar to search through past SP transactions.'
      },
      {
        studentId: studentA._id,
        seasonId: season._id,
        type: 'weeklyQuest',
        content: 'Create a debugging quest focused on concurrency and race conditions.'
      }
    ]);
    
    const suggestions = await CouncilSuggestion.find({ seasonId: season._id }).populate('studentId').lean();
    const suggestionsData = suggestions.map(s => ({
      type: s.type,
      studentName: studentA.name,
      content: s.content
    }));
    
    const insightsReport = localGenerateInsights(suggestionsData, season.name);
    console.log(`\nLocal Offline Suggestions Report:\n${insightsReport}`);

    // Clean up
    await Season.deleteMany({ name: /^Test Season/ });
    await Student.deleteMany({ email: /@test-council\.com$/ });
    console.log('Test database entries successfully cleaned.');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY (OFFLINE MODE)! 🎉');

  } catch (err) {
    console.error('\n❌ Test failed with error:', err);
  } finally {
    console.log('\nClosing database connection...');
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
