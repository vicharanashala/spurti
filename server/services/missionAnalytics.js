import Mission from '../models/Mission.js';
import DailyMissionSummary from '../models/DailyMissionSummary.js';
import Student from '../models/Student.js';

/**
 * Calculates start and end dates helper
 */
function getDatesInRange(startDate, endDate) {
  const dates = [];
  let curr = new Date(startDate);
  const end = new Date(endDate);
  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/**
 * Weekly Insights Compiler
 */
export async function getWeeklyInsights(studentId, email, refDateStr) {
  const refDate = new Date(refDateStr);
  const startDate = new Date(refDate);
  startDate.setDate(startDate.getDate() - 6); // 7 days including reference date

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = refDateStr;

  // Fetch all missions in this range
  const missions = await Mission.find({
    studentId,
    date: { $gte: startDateStr, $lte: endDateStr }
  }).lean();

  const totalTasks = missions.length;
  const completedMissions = missions.filter(m => m.completed);
  const completedTasks = completedMissions.length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const missedTasks = totalTasks - completedTasks;

  // Most Productive Day
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts = {};
  completedMissions.forEach(m => {
    const dayName = weekdayNames[new Date(m.date).getDay()];
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
  });
  let mostProductiveDay = 'No tasks completed yet';
  let maxCompleted = 0;
  Object.keys(dayCounts).forEach(day => {
    if (dayCounts[day] > maxCompleted) {
      maxCompleted = dayCounts[day];
      mostProductiveDay = day;
    }
  });

  // Category Distribution
  const categories = ['coding', 'dsa', 'reading', 'assignment', 'project', 'research', 'communication', 'interview_prep', 'ai', 'other'];
  const categoryDistribution = {};
  categories.forEach(c => { categoryDistribution[c] = 0; });
  missions.forEach(m => {
    if (categoryDistribution[m.category] !== undefined) {
      categoryDistribution[m.category]++;
    } else {
      categoryDistribution['other']++;
    }
  });

  // SP Earned and Quality Average
  const spEarned = completedMissions.reduce((sum, m) => sum + (m.spEarned || 0), 0);
  
  // Let's also count completion bonuses in this range from the DailyMissionSummary records
  const summaries = await DailyMissionSummary.find({
    studentId,
    date: { $gte: startDateStr, $lte: endDateStr }
  }).lean();
  const bonusSpEarned = summaries.reduce((sum, s) => sum + (s.bonusSpEarned || 0), 0);
  const totalSpEarned = spEarned + bonusSpEarned;

  const scoredMissions = completedMissions.filter(m => m.qualityScore !== null);
  const qualityAverage = scoredMissions.length > 0
    ? Math.round(scoredMissions.reduce((sum, m) => sum + m.qualityScore, 0) / scoredMissions.length)
    : 0;

  // Composite Weekly Productivity Score
  // Weighted: 50% completion rate, 30% average quality score, 20% total completed tasks (normalized up to 10 tasks)
  const taskVolumeBonus = Math.min(20, completedTasks * 2);
  const weeklyProductivityScore = Math.round((completionRate * 0.5) + (qualityAverage * 0.3) + taskVolumeBonus);

  // AI Suggestions (Static, smart suggestions based on task trends)
  const aiSuggestions = [];
  if (completionRate < 50) {
    aiSuggestions.push('Break down your tasks into smaller parts to make them easier to start and complete.');
    aiSuggestions.push('Commit to setting at least one high-priority coding mission every morning.');
  } else if (qualityAverage < 50) {
    aiSuggestions.push('Refine task definitions: replace brief titles like "Study" with details like "Solve 3 array questions".');
    aiSuggestions.push('Ensure your tasks define clear deliverables (e.g. "push to GitHub", "write summary docs").');
  } else {
    aiSuggestions.push('Incredible work! Keep setting detailed project goals to push your learning curve.');
    aiSuggestions.push('Add an "interview prep" or "ai" category task next week to diversify your focus.');
  }
  
  if (categoryDistribution.coding === 0 && categoryDistribution.dsa === 0) {
    aiSuggestions.push('Integrate more hands-on coding or DSA problem-solving into your weekly plan.');
  }

  return {
    completionRate,
    mostProductiveDay,
    missedTasks,
    categoryDistribution,
    spEarned: totalSpEarned,
    qualityAverage,
    weeklyProductivityScore,
    aiSuggestions
  };
}

/**
 * Monthly Analytics Compiler
 */
export async function getMonthlyAnalytics(studentId, email, refDateStr) {
  const refDate = new Date(refDateStr);
  const startDate = new Date(refDate);
  startDate.setDate(startDate.getDate() - 29); // Last 30 days

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = refDateStr;

  const [missions, summaries, student] = await Promise.all([
    Mission.find({ studentId, date: { $gte: startDateStr, $lte: endDateStr } }).lean(),
    DailyMissionSummary.find({ studentId, date: { $gte: startDateStr, $lte: endDateStr } }).lean(),
    Student.findById(studentId).lean()
  ]);

  const dates = getDatesInRange(startDate, refDate);

  // 1. Completion Rate Trend (daily percentage of completed vs total)
  // 2. Quality Trend (daily average quality)
  // 3. SP Growth (cumulative daily total)
  const dailyMetrics = {};
  dates.forEach(d => {
    dailyMetrics[d] = {
      total: 0,
      completed: 0,
      sp: 0,
      qualitySum: 0,
      qualityCount: 0
    };
  });

  missions.forEach(m => {
    if (dailyMetrics[m.date]) {
      dailyMetrics[m.date].total++;
      if (m.completed) {
        dailyMetrics[m.date].completed++;
        dailyMetrics[m.date].sp += m.spEarned || 0;
        if (m.qualityScore !== null) {
          dailyMetrics[m.date].qualitySum += m.qualityScore;
          dailyMetrics[m.date].qualityCount++;
        }
      }
    }
  });

  // Incorporate Daily Summaries (bonus SP)
  summaries.forEach(s => {
    if (dailyMetrics[s.date]) {
      dailyMetrics[s.date].sp += s.bonusSpEarned || 0;
    }
  });

  const completionTrend = [];
  const qualityTrend = [];
  const spGrowth = [];
  let runningSp = 0;

  dates.forEach(d => {
    const metrics = dailyMetrics[d];
    const rate = metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0;
    const avgQ = metrics.qualityCount > 0 ? Math.round(metrics.qualitySum / metrics.qualityCount) : 0;
    
    runningSp += metrics.sp;

    completionTrend.push({ date: d, value: rate });
    qualityTrend.push({ date: d, value: avgQ });
    spGrowth.push({ date: d, value: runningSp });
  });

  // Category heatmap (counts of completions per category over last 30 days)
  const categories = ['coding', 'dsa', 'reading', 'assignment', 'project', 'research', 'communication', 'interview_prep', 'ai', 'other'];
  const categoryHeatmap = {};
  categories.forEach(c => { categoryHeatmap[c] = { total: 0, completed: 0 }; });

  missions.forEach(m => {
    const cat = categories.includes(m.category) ? m.category : 'other';
    categoryHeatmap[cat].total++;
    if (m.completed) {
      categoryHeatmap[cat].completed++;
    }
  });

  // Calculate best, weakest, and most common category
  let bestPerformingCategory = 'N/A';
  let bestRate = -1;
  let weakestCategory = 'N/A';
  let weakestRate = 101;
  let mostCommonTaskType = 'N/A';
  let maxCount = -1;

  categories.forEach(cat => {
    const stats = categoryHeatmap[cat];
    if (stats.total > maxCount) {
      maxCount = stats.total;
      mostCommonTaskType = cat;
    }
    if (stats.total >= 2) {
      const rate = Math.round((stats.completed / stats.total) * 100);
      if (rate > bestRate) {
        bestRate = rate;
        bestPerformingCategory = cat;
      }
    }
    if (stats.total >= 1) {
      const rate = Math.round((stats.completed / stats.total) * 100);
      if (rate < weakestRate) {
        weakestRate = rate;
        weakestCategory = cat;
      }
    }
  });

  if (bestPerformingCategory !== 'N/A') {
    bestPerformingCategory = `${bestPerformingCategory} (${bestRate}% completion)`;
  }
  if (weakestCategory !== 'N/A') {
    weakestCategory = `${weakestCategory} (${weakestRate}% completion)`;
  }

  return {
    completionTrend,
    qualityTrend,
    spGrowth,
    categoryHeatmap,
    bestPerformingCategory,
    weakestCategory,
    mostCommonTaskType,
    longestStreak: student?.longestMissionStreak || 0
  };
}
