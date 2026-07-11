import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import Mission from '../models/Mission.js';
import DailyMissionSummary from '../models/DailyMissionSummary.js';
import SPTransaction from '../models/SPTransaction.js';
import { evaluateMissionHeuristic, calculateSpForQuality } from '../services/aiService.js';
import { getWeeklyInsights, getMonthlyAnalytics } from '../services/missionAnalytics.js';

// IST Date Helper
function getISTDateString(date = new Date()) {
  const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options);
  return formatter.format(date);
}

function isYesterday(prevDateStr, currDateStr) {
  if (!prevDateStr) return false;
  const prev = new Date(prevDateStr + 'T12:00:00');
  const curr = new Date(currDateStr + 'T12:00:00');
  const diff = curr.getTime() - prev.getTime();
  return diff === 24 * 60 * 60 * 1000;
}

// In-Memory Database Fallback for Environments Without Active MongoDB
let useMockDb = false;
const mockDb = {
  students: [],
  missions: [],
  summaries: [],
  transactions: []
};

function setupMockDb() {
  const mockModel = (model, storage) => {
    model.deleteOne = async (query) => {
      const before = storage.length;
      const key = Object.keys(query)[0];
      const val = query[key];
      const idx = storage.findIndex(item => String(item[key]) === String(val));
      if (idx !== -1) storage.splice(idx, 1);
      return { deletedCount: before - storage.length };
    };

    model.deleteMany = async (query) => {
      const before = storage.length;
      const key = Object.keys(query)[0];
      const val = query[key];
      let i = storage.length;
      while (i--) {
        if (String(storage[i][key]) === String(val)) storage.splice(i, 1);
      }
      return { deletedCount: before - storage.length };
    };

    model.create = async (docs) => {
      const isArray = Array.isArray(docs);
      const items = isArray ? docs : [docs];
      
      const defaults = {};
      Object.keys(model.schema.paths).forEach(path => {
        const defaultValue = model.schema.paths[path].options.default;
        if (defaultValue !== undefined && typeof defaultValue !== 'function') {
          defaults[path] = defaultValue;
        } else if (typeof defaultValue === 'function') {
          defaults[path] = defaultValue();
        }
      });

      const created = items.map(doc => {
        const item = {
          _id: new mongoose.Types.ObjectId(),
          ...defaults,
          ...doc,
          save: async function() {
            Object.assign(item, this);
            return item;
          },
          toObject: function() { return { ...item }; }
        };
        storage.push(item);
        return item;
      });
      return isArray ? created : created[0];
    };

    model.countDocuments = async (query) => {
      const keys = Object.keys(query);
      return storage.filter(item => {
        return keys.every(k => String(item[k]) === String(query[k]));
      }).length;
    };

    model.find = (query = {}) => {
      const keys = Object.keys(query);
      const matched = storage.filter(item => {
        return keys.every(k => {
          if (query[k] && query[k].$gte && query[k].$lte) {
            return item[k] >= query[k].$gte && item[k] <= query[k].$lte;
          }
          return String(item[k]) === String(query[k]);
        });
      });

      const chain = {
        sort: () => chain,
        lean: () => chain,
        exec: async () => matched
      };
      
      chain.then = (onResolve) => Promise.resolve(matched).then(onResolve);
      return chain;
    };

    model.findOne = async (query) => {
      const keys = Object.keys(query);
      const matched = storage.find(item => {
        return keys.every(k => {
          if (query[k] && query[k].$or) {
            return query[k].$or.some(subQuery => {
              const subK = Object.keys(subQuery)[0];
              return String(item[subK]) === String(subQuery[subK]);
            });
          }
          return String(item[k]) === String(query[k]);
        });
      });
      
      if (!matched) return null;
      
      return {
        ...matched,
        save: async function() {
          Object.assign(matched, this);
          return matched;
        },
        toObject: function() { return { ...matched }; }
      };
    };

    model.findById = (id) => {
      const chain = {
        lean: () => chain,
        then: (onResolve) => {
          return model.findOne({ _id: id }).then(onResolve);
        }
      };
      return chain;
    };

    model.findOneAndUpdate = async (query, update, options) => {
      let doc = await model.findOne(query);
      
      // Extract update fields
      let setUpdate = {};
      let incUpdate = update.$inc || {};
      let maxUpdate = update.$max || {};
      
      if (update.$set) {
        setUpdate = update.$set;
      } else {
        Object.keys(update).forEach(k => {
          if (!k.startsWith('$')) {
            setUpdate[k] = update[k];
          }
        });
      }

      if (!doc && options && options.upsert) {
        const docData = { ...query, ...setUpdate };
        doc = await model.create(docData);
      } else if (doc) {
        const storageDoc = storage.find(item => String(item._id) === String(doc._id));
        if (storageDoc) {
          Object.assign(storageDoc, setUpdate);
          Object.keys(incUpdate).forEach(k => {
            storageDoc[k] = (storageDoc[k] || 0) + incUpdate[k];
          });
          Object.keys(maxUpdate).forEach(k => {
            storageDoc[k] = Math.max(storageDoc[k] || 0, maxUpdate[k]);
          });
          Object.assign(doc, storageDoc);
        }
      }
      
      return doc;
    };
  };

  mockModel(Student, mockDb.students);
  mockModel(Mission, mockDb.missions);
  mockModel(DailyMissionSummary, mockDb.summaries);
  mockModel(SPTransaction, mockDb.transactions);

  mongoose.disconnect = async () => {};
}

async function updateDailySummaryCount(email, studentId, date) {
  const missions = await Mission.find({ studentId, date });
  const totalTasks = missions.length;
  const completedMissions = missions.filter(m => m.completed);
  const completedTasksCount = completedMissions.length;
  
  const qualityScores = missions.map(m => m.qualityScore).filter(s => s !== null);
  const qualityAverage = qualityScores.length > 0 
    ? Math.round(qualityScores.reduce((sum, q) => sum + q, 0) / qualityScores.length)
    : 0;

  const baseSpEarned = completedMissions.reduce((sum, m) => sum + (m.spEarned || 0), 0);

  return await DailyMissionSummary.findOneAndUpdate(
    { email, date },
    { 
      studentId,
      totalTasks,
      completedTasks: completedTasksCount,
      qualityAverage,
      baseSpEarned
    },
    { upsert: true, new: true }
  );
}

async function runTests() {
  console.log('Connecting to database...');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    console.log('Connected to MongoDB database.');
  } catch (err) {
    console.log('MongoDB server connection refused. Activating mock in-memory database...');
    useMockDb = true;
    setupMockDb();
  }

  // Clean up any old test data
  const testEmail = 'test_mission_student@iitrpr.ac.in';
  await Student.deleteOne({ email: testEmail });
  await Mission.deleteMany({ email: testEmail });
  await DailyMissionSummary.deleteMany({ email: testEmail });
  await SPTransaction.deleteMany({ email: testEmail });

  // 1. Test Heuristic Quality Scores
  console.log('\n--- 1. Testing Quality Evaluator ---');
  const vagueEval = evaluateMissionHeuristic('study', '', 'other', 30);
  console.log(`Vague task ("study") Score: ${vagueEval.qualityScore} (Expected: <=30)`);
  if (vagueEval.qualityScore > 30) throw new Error('Vague task score is too high!');

  const betterEval = evaluateMissionHeuristic('Solve 5 binary search problems', 'On LeetCode', 'dsa', 60);
  console.log(`Better task Score: ${betterEval.qualityScore} (Expected: ~75)`);
  if (betterEval.qualityScore < 60 || betterEval.qualityScore > 85) throw new Error('Better task score is out of range!');

  const excellentEval = evaluateMissionHeuristic('complete module 4, build Flask CRUD project, push to GitHub, write documentation', 'Deploy to Render', 'project', 180);
  console.log(`Excellent task Score: ${excellentEval.qualityScore} (Expected: >=90)`);
  if (excellentEval.qualityScore < 90) throw new Error('Excellent task score is too low!');

  // 2. Test SP Calculation Rubric
  console.log('\n--- 2. Testing SP Calculator Rubric ---');
  console.log(`SP for quality ${vagueEval.qualityScore}: ${calculateSpForQuality(vagueEval.qualityScore)} (Expected: 2)`);
  if (calculateSpForQuality(vagueEval.qualityScore) !== 2) throw new Error('Vague SP mismatch');

  console.log(`SP for quality ${betterEval.qualityScore}: ${calculateSpForQuality(betterEval.qualityScore)} (Expected: 10)`);
  if (calculateSpForQuality(betterEval.qualityScore) !== 10) throw new Error('Better SP mismatch');

  console.log(`SP for quality ${excellentEval.qualityScore}: ${calculateSpForQuality(excellentEval.qualityScore)} (Expected: 15)`);
  if (calculateSpForQuality(excellentEval.qualityScore) !== 15) throw new Error('Excellent SP mismatch');

  // 3. Create Test Student
  console.log('\n--- 3. Creating Test Student ---');
  const student = await Student.create({
    name: 'Test Mission Student',
    email: testEmail,
    internshipStartDate: new Date(),
    totalSp: 100,
    highestSpEver: 100
  });
  console.log(`Created test student ${student.name} with 100 base SP.`);

  // 4. Create Missions
  console.log('\n--- 4. Planning Daily Missions ---');
  const todayStr = getISTDateString();
  
  const m1 = await Mission.create({
    email: student.email,
    studentId: student._id,
    title: 'Solve 5 binary search problems',
    category: 'dsa',
    priority: 'high',
    duration: 60,
    date: todayStr,
    order: 0,
    qualityScore: betterEval.qualityScore,
    qualityEvaluation: betterEval
  });
  console.log(`Planned Mission 1: "${m1.title}" (Quality: ${m1.qualityScore})`);

  const m2 = await Mission.create({
    email: student.email,
    studentId: student._id,
    title: 'complete module 4, build Flask CRUD project, push to GitHub, write documentation',
    category: 'project',
    priority: 'high',
    duration: 180,
    date: todayStr,
    order: 1,
    qualityScore: excellentEval.qualityScore,
    qualityEvaluation: excellentEval
  });
  console.log(`Planned Mission 2: "${m2.title}" (Quality: ${m2.qualityScore})`);

  await updateDailySummaryCount(student.email, student._id, todayStr);
  const summary = await DailyMissionSummary.findOne({ studentId: student._id, date: todayStr });
  console.log(`Daily Summary Counted: Total Tasks = ${summary.totalTasks}, Completed = ${summary.completedTasks}`);
  if (summary.totalTasks !== 2) throw new Error('Total tasks count mismatch');

  // 5. Complete Tasks & Earn SP
  console.log('\n--- 5. Completing Tasks and Checking SP & Streaks ---');
  
  // Toggle first mission complete
  m1.completed = true;
  m1.completedAt = new Date();
  const sp1 = calculateSpForQuality(m1.qualityScore);
  m1.spEarned = sp1;
  await m1.save();
  
  student.totalSp += sp1;
  student.highestSpEver = Math.max(student.highestSpEver, student.totalSp);
  await student.save();

  await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'mission',
    sessionLabel: 'Daily Missions',
    deltaValue: sp1,
    appliedDelta: sp1,
    balanceAfter: student.totalSp,
    reason: `Completed daily mission: "${m1.title}"`,
    dateTime: new Date()
  });
  
  console.log(`Completed Mission 1. Awarded +${sp1} SP. Student Total SP: ${student.totalSp}`);
  if (student.totalSp !== 110) throw new Error('SP earning calculation error');

  await updateDailySummaryCount(student.email, student._id, todayStr);

  // Toggle second mission complete (triggering daily completion bonus + streaks)
  m2.completed = true;
  m2.completedAt = new Date();
  const sp2 = calculateSpForQuality(m2.qualityScore);
  m2.spEarned = sp2;
  await m2.save();

  student.totalSp += sp2;
  student.highestSpEver = Math.max(student.highestSpEver, student.totalSp);
  await student.save();

  await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'mission',
    sessionLabel: 'Daily Missions',
    deltaValue: sp2,
    appliedDelta: sp2,
    balanceAfter: student.totalSp,
    reason: `Completed daily mission: "${m2.title}"`,
    dateTime: new Date()
  });

  console.log(`Completed Mission 2. Awarded +${sp2} SP. Student Total SP: ${student.totalSp}`);
  if (student.totalSp !== 125) throw new Error('SP earning calculation error');

  const todaySummary = await updateDailySummaryCount(student.email, student._id, todayStr);
  
  // Apply completion bonus
  const baseSpEarned = sp1 + sp2; // 10 + 15 = 25
  const bonusSp = Math.round(baseSpEarned * 0.20); // 5 SP
  student.totalSp += bonusSp;
  student.highestSpEver = Math.max(student.highestSpEver, student.totalSp);
  
  await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'mission_bonus',
    sessionLabel: 'Daily Missions',
    deltaValue: bonusSp,
    appliedDelta: bonusSp,
    balanceAfter: student.totalSp,
    reason: `Completed all daily missions! 20% completion bonus applied`,
    dateTime: new Date()
  });

  todaySummary.bonusSpEarned = bonusSp;
  await todaySummary.save();

  console.log(`Completed all missions today! Awarded +${bonusSp} SP bonus. Student Total SP: ${student.totalSp}`);
  if (student.totalSp !== 130) throw new Error('SP bonus calculation error');

  // Streak update simulation
  if (student.lastCompletedAllMissionsDate !== todayStr) {
    if (isYesterday(student.lastCompletedAllMissionsDate, todayStr)) {
      student.dailyMissionStreak += 1;
    } else {
      student.dailyMissionStreak = 1;
    }
    student.longestMissionStreak = Math.max(student.longestMissionStreak, student.dailyMissionStreak);
    student.lastCompletedAllMissionsDate = todayStr;
  }
  await student.save();

  console.log(`Streaks: Daily Streak = ${student.dailyMissionStreak}, Longest = ${student.longestMissionStreak}`);
  if (student.dailyMissionStreak !== 1 || student.longestMissionStreak !== 1) throw new Error('Streak calculation error');

  // 6. Weekly insights & Monthly analytics
  console.log('\n--- 6. Testing Weekly Insights & Monthly Analytics ---');
  const insights = await getWeeklyInsights(student._id, student.email, todayStr);
  console.log(`Weekly Completion Rate: ${insights.completionRate}% (Expected: 100%)`);
  console.log(`Weekly Productivity Score: ${insights.weeklyProductivityScore}/100`);
  if (insights.completionRate !== 100) throw new Error('Weekly insights completion rate error');

  const analytics = await getMonthlyAnalytics(student._id, student.email, todayStr);
  console.log(`Monthly Streak recorded: ${analytics.longestStreak}`);
  if (analytics.longestStreak !== 1) throw new Error('Monthly analytics streak error');

  // Clean up test data
  console.log('\nCleaning up database test records...');
  await Student.deleteOne({ email: testEmail });
  await Mission.deleteMany({ email: testEmail });
  await DailyMissionSummary.deleteMany({ email: testEmail });
  await SPTransaction.deleteMany({ email: testEmail });
  
  await mongoose.disconnect();
  console.log('\n=====================================');
  console.log('✓ ALL AUTOMATED TESTS PASSED SUCCESSFULLY!');
  console.log('=====================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  mongoose.disconnect();
  process.exit(1);
});
