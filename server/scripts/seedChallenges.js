import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Challenge from '../models/Challenge.js';
import ChallengeParticipant from '../models/ChallengeParticipant.js';
import ChallengeProgress from '../models/ChallengeProgress.js';
import ChallengeLeaderboard from '../models/ChallengeLeaderboard.js';
import ChallengeReward from '../models/ChallengeReward.js';

async function seed() {
  console.log('Connecting to MongoDB at:', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  console.log('Cleaning up existing challenge collections...');
  await Challenge.deleteMany({});
  await ChallengeParticipant.deleteMany({});
  await ChallengeProgress.deleteMany({});
  await ChallengeLeaderboard.deleteMany({});
  await ChallengeReward.deleteMany({});

  const now = new Date();
  
  // 1. Daily Attendance Challenge (Ends today)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const daily = {
    name: 'Daily Attendance Streak',
    description: 'Attend today\'s sessions to keep your learning streak hot. Earn points and start climbing the ranks!',
    banner: '📅',
    type: 'Attendance',
    startDate: todayStart,
    endDate: todayEnd,
    status: 'active',
    maxParticipants: 100,
    eligibilityRules: 'Open to all active students in the current cohort.',
    difficulty: 'Easy',
    tasksRequired: 1,
    completionCriteria: {
      eventType: 'attendance_mark',
      details: {}
    },
    rewardBadge: 'Attendance Hero',
    spPoints: 10,
    winnerBonus: 30,
    runnerUpBonus: 15,
    thirdBonus: 10,
    colorTheme: 'linear-gradient(135deg, #12805c, #0d5d43)',
    isRewarded: false
  };

  // 2. Weekly Quiz Blitz (Started 3 days ago, active)
  const weeklyStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const weeklyEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  
  const weekly = {
    name: 'Weekly Quiz Blitz',
    description: 'Attempt and complete 5 quizzes this week. Test your understanding, earn badges, and get a huge SP boost.',
    banner: '⚡',
    type: 'Quiz',
    startDate: weeklyStart,
    endDate: weeklyEnd,
    status: 'active',
    maxParticipants: null,
    eligibilityRules: 'Open to all active students.',
    difficulty: 'Medium',
    tasksRequired: 5,
    completionCriteria: {
      eventType: 'quiz_complete',
      details: {}
    },
    rewardBadge: 'Quiz Master',
    spPoints: 30,
    winnerBonus: 100,
    runnerUpBonus: 50,
    thirdBonus: 25,
    colorTheme: 'linear-gradient(135deg, #176b87, #0f4d62)',
    isRewarded: false
  };

  // 3. Monthly Consistency Challenge (Started 10 days ago, active)
  const monthlyStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const monthlyEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);
  
  const monthly = {
    name: 'Consistency King',
    description: 'Set and complete 10 study goals this month. Show unmatched dedication to dominate the global leaderboard!',
    banner: '👑',
    type: 'Monthly',
    startDate: monthlyStart,
    endDate: monthlyEnd,
    status: 'active',
    maxParticipants: null,
    eligibilityRules: 'Required study plans submitted.',
    difficulty: 'Hard',
    tasksRequired: 10,
    completionCriteria: {
      eventType: 'study_goal_complete',
      details: {}
    },
    rewardBadge: 'Consistency King',
    spPoints: 100,
    winnerBonus: 250,
    runnerUpBonus: 125,
    thirdBonus: 75,
    colorTheme: 'linear-gradient(135deg, #a15c07, #744203)',
    isRewarded: false
  };

  // 4. Completed challenge (Ended yesterday, unrewarded)
  const pastStart = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  
  const completed = {
    name: 'Introductory Coding Blitz',
    description: 'Complete 3 coding challenges. This introductory sprint has finished, and winners are ready to be announced.',
    banner: '💻',
    type: 'Coding',
    startDate: pastStart,
    endDate: pastEnd,
    status: 'active', // starts as active so lazy checking awards it when it runs
    maxParticipants: null,
    eligibilityRules: 'None',
    difficulty: 'Medium',
    tasksRequired: 3,
    completionCriteria: {
      eventType: 'assignment_submit',
      details: {}
    },
    rewardBadge: 'Coding Champion',
    spPoints: 25,
    winnerBonus: 80,
    runnerUpBonus: 40,
    thirdBonus: 20,
    colorTheme: 'linear-gradient(135deg, #b42318, #821911)',
    isRewarded: false
  };

  const docs = await Challenge.create([daily, weekly, monthly, completed]);
  console.log('Seeded', docs.length, 'challenges successfully!');
  
  await mongoose.disconnect();
  console.log('MongoDB disconnected.');
}

seed().catch(err => {
  console.error('Seeding challenges failed:', err);
  process.exit(1);
});
