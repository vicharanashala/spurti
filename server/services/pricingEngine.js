import ServiceCategory from '../models/ServiceCategory.js';
import Reputation from '../models/Reputation.js';

const BASE_PRICES = {
  'Doubt Clearing': 10,
  'Coding Help': 25,
  'Debugging': 20,
  'Assignment Review': 15,
  'Mock Interviews': 40,
  'Resume Review': 30,
  'Documentation': 15,
  'UI Design': 30,
  'Research Assistance': 35,
  'Presentation Creation': 20,
  'Note Making': 10,
  'Language Translation': 15,
  'Peer Tutoring': 20,
  'Career Guidance': 35,
  'Other': 15
};

const DIFFICULTY_MULTIPLIERS = {
  easy: 1.0,
  medium: 2.0,
  hard: 3.5,
  expert: 5.5
};

const URGENCY_MULTIPLIERS = {
  normal: 1.0,
  urgent: 1.5
};

const SKILL_RARITY_BOOST = {
  programming: 1.2,
  ai: 1.4,
  research: 1.3,
  debugging: 1.15,
  'ui/ux design': 1.25,
  mathematics: 1.1,
  'public speaking': 1.1,
  documentation: 1.0,
  'video editing': 1.2,
  'presentation design': 1.1
};

export async function estimatePrice({ category, difficulty, estimatedDuration, urgency, providerReputation, demandFactor = 1.0 }) {
  let basePrice = BASE_PRICES[category] || BASE_PRICES['Other'];

  const categoryDoc = await ServiceCategory.findOne({ name: category });
  if (categoryDoc && categoryDoc.basePrice) {
    basePrice = categoryDoc.basePrice;
  }

  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[difficulty] || DIFFICULTY_MULTIPLIERS.medium;

  const urgencyMultiplier = URGENCY_MULTIPLIERS[urgency] || URGENCY_MULTIPLIERS.normal;

  const durationMultiplier = Math.max(0.5, Math.min(3.0, estimatedDuration / 30));

  let reputationFactor = 1.0;
  if (providerReputation) {
    reputationFactor = 0.8 + (providerReputation / 100) * 0.4;
  }

  const skillRarity = SKILL_RARITY_BOOST[category.toLowerCase()] || 1.0;

  const rawPrice = basePrice * difficultyMultiplier * durationMultiplier * urgencyMultiplier * reputationFactor * skillRarity * demandFactor;

  const minPrice = Math.max(5, Math.round(basePrice * 0.5));
  const maxPrice = Math.max(minPrice * 3, Math.round(rawPrice * 1.5));
  const estimated = Math.round(rawPrice);

  return {
    estimated: Math.max(minPrice, estimated),
    range: { min: minPrice, max: maxPrice },
    breakdown: {
      basePrice,
      difficultyMultiplier,
      durationMultiplier,
      urgencyMultiplier,
      reputationFactor,
      skillRarity,
      demandFactor
    },
    confidence: calculateConfidence(difficulty, estimatedDuration, providerReputation)
  };
}

function calculateConfidence(difficulty, duration, reputation) {
  let confidence = 0.5;
  if (duration >= 15 && duration <= 120) confidence += 0.2;
  else if (duration >= 5 && duration <= 180) confidence += 0.1;
  if (reputation && reputation >= 50) confidence += 0.15;
  if (reputation && reputation >= 80) confidence += 0.1;
  if (['easy', 'medium'].includes(difficulty)) confidence += 0.1;
  return Math.min(0.95, confidence);
}

export async function getDynamicPrice({ service, provider }) {
  const demandFactor = await calculateDemandFactor(service.category);

  let providerReputation = null;
  if (provider) {
    const rep = await Reputation.findOne({ userId: provider._id });
    providerReputation = rep?.trustScore || null;
  }

  return estimatePrice({
    category: service.category,
    difficulty: service.difficulty,
    estimatedDuration: service.estimatedDuration,
    urgency: service.urgency,
    providerReputation,
    demandFactor
  });
}

export async function calculateDemandFactor(category) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const Service = (await import('../models/Service.js')).default;
  const completedCount = await Service.countDocuments({
    category,
    status: 'completed',
    completedAt: { $gte: thirtyDaysAgo }
  });

  const openCount = await Service.countDocuments({
    category,
    status: 'open'
  });

  if (completedCount === 0) return 1.0;
  const ratio = openCount / completedCount;
  return Math.max(0.7, Math.min(1.5, 1.0 + (ratio - 1) * 0.3));
}

export function validatePrice(estimated, offered) {
  const tolerance = 0.3;
  const lower = estimated * (1 - tolerance);
  const upper = estimated * (1 + tolerance);
  return offered >= lower && offered <= upper;
}