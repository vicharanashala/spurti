import Service from '../models/Service.js';
import SkillProfile from '../models/SkillProfile.js';
import Reputation from '../models/Reputation.js';
import Student from '../models/Student.js';

export async function findRecommendedHelpers({ service, limit = 5 }) {
  const candidates = await findCandidates(service);

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const scores = await calculateMatchScore(service, candidate);
      return { candidate, scores };
    })
  );

  scored.sort((a, b) => b.scores.total - a.scores.total);

  return scored.slice(0, limit).map(({ candidate, scores }) => ({
    user: candidate.user,
    skillProfile: candidate.skillProfile,
    reputation: candidate.reputation,
    matchScore: scores.total,
    breakdown: scores
  }));
}

async function findCandidates(service) {
  const candidates = await Student.find({
    _id: { $ne: service.buyerId },
    status: 'active'
  });

  const skillProfiles = await SkillProfile.find({
    userId: { $in: candidates.map(c => c._id) }
  });

  const reputations = await Reputation.find({
    userId: { $in: candidates.map(c => c._id) }
  });

  const profileMap = new Map(skillProfiles.map(p => [String(p.userId), p]));
  const repMap = new Map(reputations.map(r => [String(r.userId), r]));

  return candidates
    .map(user => ({
      user,
      skillProfile: profileMap.get(String(user._id)) || null,
      reputation: repMap.get(String(user._id)) || null
    }))
    .filter(c => c.skillProfile?.availability !== 'unavailable');
}

export async function calculateMatchScore(service, candidate) {
  const skillScore = await calculateSkillScore(service, candidate);
  const reputationScore = await calculateReputationScore(candidate.reputation);
  const availabilityScore = calculateAvailabilityScore(candidate.skillProfile);
  const experienceScore = await calculateExperienceScore(service, candidate);
  const responseTimeScore = calculateResponseTimeScore(candidate.reputation);

  const weights = { skill: 0.35, reputation: 0.25, availability: 0.15, experience: 0.15, responseTime: 0.1 };

  const total = (
    skillScore * weights.skill +
    reputationScore * weights.reputation +
    availabilityScore * weights.availability +
    experienceScore * weights.experience +
    responseTimeScore * weights.responseTime
  );

  return {
    total: Math.round(total * 100) / 100,
    skill: Math.round(skillScore * 100) / 100,
    reputation: Math.round(reputationScore * 100) / 100,
    availability: Math.round(availabilityScore * 100) / 100,
    experience: Math.round(experienceScore * 100) / 100,
    responseTime: Math.round(responseTimeScore * 100) / 100
  };
}

async function calculateSkillScore(service, candidate) {
  if (!candidate.skillProfile) return 30;

  const categoryLower = service.category.toLowerCase();
  const skill = candidate.skillProfile.skills.find(
    s => s.name.toLowerCase() === categoryLower || categoryLower.includes(s.name.toLowerCase())
  );

  if (!skill) return 35;

  const levelScores = { beginner: 50, intermediate: 70, advanced: 85, expert: 95 };
  return levelScores[skill.level] || 60;
}

async function calculateReputationScore(reputation) {
  if (!reputation) return 30;
  return reputation.trustScore;
}

function calculateAvailabilityScore(skillProfile) {
  if (!skillProfile) return 50;
  const availabilityScores = { available: 100, busy: 60, unavailable: 0 };
  return availabilityScores[skillProfile.availability] || 50;
}

async function calculateExperienceScore(service, candidate) {
  if (!candidate.skillProfile) return 30;

  const Service = (await import('../models/Service.js')).default;
  const completedCount = await Service.countDocuments({
    providerId: candidate.user._id,
    category: service.category,
    status: 'completed'
  });

  if (completedCount === 0) return 25;
  if (completedCount < 3) return 45;
  if (completedCount < 10) return 65;
  if (completedCount < 25) return 80;
  return 90;
}

function calculateResponseTimeScore(reputation) {
  if (!reputation?.responseTime?.averageMinutes) return 50;
  const avgMinutes = reputation.responseTime.averageMinutes;
  if (avgMinutes <= 60) return 100;
  if (avgMinutes <= 180) return 80;
  if (avgMinutes <= 480) return 60;
  return 40;
}

export async function analyzeApplication(service, applicant) {
  const matchScore = await calculateMatchScore(service, applicant);
  const reputation = await Reputation.findOne({ userId: applicant._id });
  const skillProfile = await SkillProfile.findOne({ userId: applicant._id });

  const strengths = [];
  const concerns = [];
  let recommendation = 'neutral';

  if (matchScore.skill >= 80) strengths.push('Expert-level skill match for this category');
  if (matchScore.reputation >= 80) strengths.push('Highly trusted helper');
  if (reputation?.completionRate >= 90) strengths.push('Excellent completion rate');

  if (matchScore.skill < 50) concerns.push('Limited experience in this category');
  if (reputation?.disputeRate > 10) concerns.push('Higher than normal dispute rate');

  if (matchScore.total >= 75) recommendation = 'highly_recommended';
  else if (matchScore.total >= 55) recommendation = 'recommended';
  else if (matchScore.total < 35) recommendation = 'not_recommended';

  return {
    strengths,
    concerns,
    recommendation,
    matchScore,
    skillProfileSummary: skillProfile ? {
      skills: skillProfile.skills.slice(0, 5).map(s => ({ name: s.name, level: s.level })),
      bio: skillProfile.bio
    } : null
  };
}

export async function getTopHelpers({ category, limit = 10 }) {
  const Service = (await import('../models/Service.js')).default;

  const topProviders = await Service.aggregate([
    { $match: { status: 'completed', category } },
    { $group: { _id: '$providerId', completedCount: { $sum: 1 } } },
    { $sort: { completedCount: -1 } },
    { $limit: limit * 2 }
  ]);

  const providerIds = topProviders.map(p => p._id);
  const students = await Student.find({ _id: { $in: providerIds } });
  const reputations = await Reputation.find({ userId: { $in: providerIds } });
  const skillProfiles = await SkillProfile.find({ userId: { $in: providerIds } });

  const repMap = new Map(reputations.map(r => [String(r.userId), r]));
  const profileMap = new Map(skillProfiles.map(p => [String(p.userId), p]));
  const studentMap = new Map(students.map(s => [String(s._id), s]));

  return topProviders
    .map(p => ({
      user: studentMap.get(String(p._id)),
      reputation: repMap.get(String(p._id)),
      skillProfile: profileMap.get(String(p._id)),
      completedCount: p.completedCount
    }))
    .filter(p => p.user && p.reputation)
    .sort((a, b) => b.reputation.trustScore - a.reputation.trustScore)
    .slice(0, limit);
}