import Reputation from '../models/Reputation.js';
import Review from '../models/Review.js';
import Service from '../models/Service.js';
import SkillProfile from '../models/SkillProfile.js';

export async function getOrCreateReputation(userId, email) {
  let reputation = await Reputation.findOne({ userId });
  if (!reputation) {
    reputation = await Reputation.create({
      userId,
      email: email.toLowerCase(),
      trustScore: 50,
      overallRating: 0,
      totalReviews: 0
    });
  }
  return reputation;
}

export async function updateReputationAfterTransaction({ serviceId, buyerId, providerId, isSuccessful }) {
  if (isSuccessful) {
    await Promise.all([
      updateProviderReputation(providerId, serviceId),
      updateBuyerStats(buyerId)
    ]);
  }
}

async function updateProviderReputation(providerId, serviceId) {
  const service = await Service.findById(serviceId);
  if (!service) return;

  const providerRep = await Reputation.findOne({ userId: providerId });
  if (!providerRep) return;

  const completedCount = await Service.countDocuments({
    providerId,
    status: { $in: ['completed', 'in_progress'] }
  });

  const successfulCount = await Service.countDocuments({
    providerId,
    status: 'completed'
  });

  const disputeCount = await Service.countDocuments({
    providerId,
    status: 'disputed'
  });

  const reviews = await Review.find({ revieweeId: providerId });
  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = reviews.length > 0 ? totalRating / reviews.length : 0;

  const completionRate = completedCount > 0 ? (successfulCount / completedCount) * 100 : 0;
  const disputeRate = completedCount > 0 ? (disputeCount / completedCount) * 100 : 0;

  const trustScore = calculateTrustScore({
    completionRate,
    avgRating,
    disputeRate,
    totalTransactions: successfulCount
  });

  const qualityScore = avgRating * 20;
  const reliabilityScore = Math.max(0, 100 - disputeRate * 5 - (100 - completionRate) * 0.5);

  const totalEarnings = await calculateTotalEarnings(providerId);
  const isTopHelper = trustScore >= 80 && successfulCount >= 5;

  await Reputation.updateOne({ userId: providerId }, {
    trustScore: Math.round(trustScore),
    overallRating: Math.round(avgRating * 10) / 10,
    totalReviews: reviews.length,
    completionRate: Math.round(completionRate * 10) / 10,
    qualityScore: Math.round(qualityScore),
    reliabilityScore: Math.round(reliabilityScore),
    disputeRate: Math.round(disputeRate * 10) / 10,
    totalTransactions: successfulCount,
    successfulTransactions: successfulCount,
    totalEarnings,
    isTopHelper,
    rank: isTopHelper ? await calculateRank(trustScore) : 0,
    lastActiveAt: new Date()
  });
}

function calculateTrustScore({ completionRate, avgRating, disputeRate, totalTransactions }) {
  const completionWeight = 0.35;
  const ratingWeight = 0.30;
  const disputeWeight = 0.20;
  const volumeWeight = 0.15;

  const disputeScore = Math.max(0, 100 - disputeRate * 10);
  const volumeScore = Math.min(100, totalTransactions * 5);

  return (
    completionRate * completionWeight +
    avgRating * 20 * ratingWeight +
    disputeScore * disputeWeight +
    volumeScore * volumeWeight
  );
}

async function updateBuyerStats(buyerId) {
  await Reputation.updateOne(
    { userId: buyerId },
    { $set: { lastActiveAt: new Date() } },
    { upsert: true }
  );
}

async function calculateTotalEarnings(providerId) {
  const Service = (await import('../models/Service.js')).default;
  const services = await Service.find({ providerId, status: 'completed' });
  return services.reduce((sum, s) => sum + (s.escrowAmount || 0), 0);
}

async function calculateRank(trustScore) {
  const higherCount = await Reputation.countDocuments({
    trustScore: { $gt: trustScore },
    isTopHelper: true
  });
  return higherCount + 1;
}

export async function updateSkillRating(userId, category, rating) {
  const reputation = await Reputation.findOne({ userId });
  if (!reputation) return;

  const skillRatings = reputation.skillRatings || new Map();
  const current = skillRatings.get(category) || { rating: 0, count: 0, totalScore: 0 };

  const newCount = current.count + 1;
  const newTotal = current.totalScore + rating;
  const newRating = newTotal / newCount;

  skillRatings.set(category, {
    rating: Math.round(newRating * 10) / 10,
    count: newCount,
    totalScore: newTotal
  });

  await Reputation.updateOne({ userId }, { skillRatings });
}

export async function updateResponseTime(userId, responseMinutes) {
  const reputation = await Reputation.findOne({ userId });
  if (!reputation) return;

  const { averageMinutes, count } = reputation.responseTime;
  const newCount = count + 1;
  const newAvg = count > 0
    ? (averageMinutes * count + responseMinutes) / newCount
    : responseMinutes;

  await Reputation.updateOne(
    { userId },
    {
      'responseTime.averageMinutes': Math.round(newAvg),
      'responseTime.count': newCount
    }
  );
}

export async function getReputationProfile(userId) {
  const reputation = await Reputation.findOne({ userId });
  const skillProfile = await SkillProfile.findOne({ userId });
  const reviews = await Review.find({ revieweeId: userId, isPublic: true })
    .sort({ createdAt: -1 })
    .limit(10);

  if (!reputation) {
    return {
      reputation: null,
      skillProfile: null,
      recentReviews: reviews,
      stats: null
    };
  }

  const completedServices = await Service.find({
    $or: [{ buyerId: userId }, { providerId: userId }],
    status: 'completed'
  });

  const buyerServices = completedServices.filter(s => String(s.buyerId) === String(userId));
  const providerServices = completedServices.filter(s => String(s.providerId) === String(userId));

  return {
    reputation: {
      trustScore: reputation.trustScore,
      overallRating: reputation.overallRating,
      totalReviews: reputation.totalReviews,
      completionRate: reputation.completionRate,
      qualityScore: reputation.qualityScore,
      reliabilityScore: reputation.reliabilityScore,
      totalTransactions: reputation.totalTransactions,
      totalEarnings: reputation.totalEarnings,
      totalSpendings: reputation.totalSpendings,
      isTopHelper: reputation.isTopHelper,
      rank: reputation.rank,
      badges: reputation.badges,
      streakDays: reputation.streakDays
    },
    skillProfile: skillProfile ? {
      skills: skillProfile.skills,
      bio: skillProfile.bio,
      availability: skillProfile.availability,
      teachingStyle: skillProfile.teachingStyle,
      languages: skillProfile.languages
    } : null,
    recentReviews: reviews.map(r => ({
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      createdAt: r.createdAt,
      reviewerEmail: r.reviewerEmail
    })),
    stats: {
      servicesAsBuyer: buyerServices.length,
      servicesAsProvider: providerServices.length,
      categories: [...new Set(providerServices.map(s => s.category))]
    }
  };
}

export async function getLeaderboard({ limit = 50, category }) {
  const query = { isTopHelper: true };
  if (category) {
    query['skillRatings.' + category] = { $exists: true };
  }

  const reputations = await Reputation.find(query)
    .sort({ trustScore: -1, totalEarnings: -1 })
    .limit(limit);

  return reputations;
}