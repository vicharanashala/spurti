import { Router } from 'express';
import Service from '../models/Service.js';
import ServiceApplication from '../models/ServiceApplication.js';
import ServiceCategory from '../models/ServiceCategory.js';
import Review from '../models/Review.js';
import Dispute from '../models/Dispute.js';
import Reputation from '../models/Reputation.js';
import SkillProfile from '../models/SkillProfile.js';
import MarketplaceTransaction from '../models/MarketplaceTransaction.js';
import Student from '../models/Student.js';
import { estimatePrice, getDynamicPrice } from '../services/pricingEngine.js';
import { findRecommendedHelpers, analyzeApplication, getTopHelpers } from '../services/matchingEngine.js';
import { holdInEscrow, releaseEscrow, refundEscrow, getEscrowStatus } from '../services/escrowService.js';
import { getReputationProfile, getOrCreateReputation, updateReputationAfterTransaction, updateSkillRating } from '../services/reputationService.js';
import { getSamagamaUser } from '../services/authService.js';

const router = Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    cookies[name.trim()] = rest.join('=').trim();
  });
  return cookies;
}

async function populateStudentFromRequest(req, res, next) {
  try {
    const devBypass = process.env.SPURTI_DEV_BYPASS === 'true';
    let email = null;

    if (devBypass && req.headers['x-dev-email']) {
      email = req.headers['x-dev-email'];
    } else {
      const cookies = parseCookies(req.headers.cookie || '');
      const data = await getSamagamaUser(cookies.chatengine_token);
      email = data?.user?.email || data?.email;
    }

    if (!email) {
      return res.status(401).json({ error: 'Authentication required', authenticated: false });
    }
    const normalizedEmail = normalizeEmail(email);
    const student = await Student.findOne({ $or: [{ email: normalizedEmail }, { alternateEmail: normalizedEmail }] }).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student not found', authenticated: false });
    }
    req.student = student;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function requireAdmin(req, res, next) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in');
  const adminToken = process.env.ADMIN_TOKEN || 'vled-local-admin';
  const reqEmail = normalizeEmail(req.headers['x-admin-email'] || '');
  const reqToken = req.headers['x-admin-token'] || '';

  if (reqEmail !== adminEmail || reqToken !== adminToken) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.post('/services', populateStudentFromRequest, async (req, res) => {
  try {
    const { title, description, category, subcategory, difficulty, estimatedDuration, deadline, priceType, estimatedPrice, priceRangeMin, priceRangeMax, urgency, tags } = req.body;

    if (!title || !description || !category || !estimatedDuration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const student = await Student.findOne({ email: req.student.email });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const price = estimatedPrice || (await estimatePrice({ category, difficulty, estimatedDuration, urgency })).estimated;

    const service = await Service.create({
      title,
      description,
      category,
      subcategory: subcategory || '',
      difficulty: difficulty || 'medium',
      estimatedDuration,
      deadline: deadline ? new Date(deadline) : null,
      priceType: priceType || 'fixed',
      estimatedPrice: price,
      priceRangeMin: priceRangeMin || null,
      priceRangeMax: priceRangeMax || null,
      urgency: urgency || 'normal',
      tags: tags || [],
      buyerId: student._id,
      buyerEmail: student.email.toLowerCase()
    });

    res.status(201).json({ success: true, service });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services', async (req, res) => {
  try {
    const { category, difficulty, status, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query;

    const query = {};
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (status) query.status = status;
    else query.status = 'open';
    if (minPrice || maxPrice) {
      query.estimatedPrice = {};
      if (minPrice) query.estimatedPrice.$gte = Number(minPrice);
      if (maxPrice) query.estimatedPrice.$lte = Number(maxPrice);
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_low: { estimatedPrice: 1 },
      price_high: { estimatedPrice: -1 },
      deadline: { deadline: 1 }
    };

    const skip = (Number(page) - 1) * Number(limit);

    const [services, total] = await Promise.all([
      Service.find(query)
        .sort(sortOptions[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('buyerId', 'name email totalSp'),
      Service.countDocuments(query)
    ]);

    res.json({ services, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('buyerId', 'name email totalSp')
      .populate('providerId', 'name email totalSp');

    if (!service) return res.status(404).json({ error: 'Service not found' });

    await Service.updateOne({ _id: service._id }, { $inc: { viewCount: 1 } });

    const escrowStatus = await getEscrowStatus(service._id);
    const applications = await ServiceApplication.find({ serviceId: service._id, status: 'accepted' })
      .populate('applicantId', 'name email');

    res.json({ service, escrowStatus, assignedProvider: applications[0] || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/services/:id', populateStudentFromRequest, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    if (String(service.buyerId) !== String(req.student._id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (service.status !== 'open') {
      return res.status(400).json({ error: 'Can only edit open services' });
    }

    const allowedUpdates = ['title', 'description', 'category', 'subcategory', 'difficulty', 'estimatedDuration', 'deadline', 'urgency', 'tags'];
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (req.body.estimatedPrice !== undefined) {
      updates.estimatedPrice = req.body.estimatedPrice;
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    res.json({ success: true, service: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/services/:id', populateStudentFromRequest, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    if (String(service.buyerId) !== String(req.student._id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (service.status === 'completed' || service.status === 'disputed') {
      return res.status(400).json({ error: 'Cannot cancel completed or disputed services' });
    }

    if (service.escrowAmount > 0) {
      await refundEscrow({
        serviceId: service._id,
        buyerId: service.buyerId,
        buyerEmail: service.buyerEmail,
        reason: 'Service cancelled by buyer'
      });
    } else {
      await Service.updateOne({ _id: service._id }, { $set: { status: 'cancelled' } });
    }

    res.json({ success: true, message: 'Service cancelled' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/services/:id/apply', populateStudentFromRequest, async (req, res) => {
  try {
    const { proposedPrice, proposedDuration, coverMessage } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    if (service.status !== 'open') return res.status(400).json({ error: 'Service is not accepting applications' });
    if (String(service.buyerId) === String(req.student._id)) {
      return res.status(400).json({ error: 'Cannot apply to your own service' });
    }

    const student = await Student.findOne({ email: req.student.email });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const existing = await ServiceApplication.findOne({
      serviceId: service._id,
      applicantId: student._id
    });
    if (existing) return res.status(400).json({ error: 'Already applied' });

    const aiAnalysis = await analyzeApplication(service, student);

    const application = await ServiceApplication.create({
      serviceId: service._id,
      applicantId: student._id,
      applicantEmail: student.email.toLowerCase(),
      coverMessage: coverMessage || '',
      proposedPrice: proposedPrice || service.estimatedPrice,
      proposedDuration: proposedDuration || service.estimatedDuration,
      matchScore: aiAnalysis.matchScore.total,
      aiAnalysis
    });

    await Service.updateOne({ _id: service._id }, { $inc: { applicationCount: 1 } });

    res.status(201).json({ success: true, application, aiAnalysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services/:id/applications', populateStudentFromRequest, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    if (String(service.buyerId) !== String(req.student._id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const applications = await ServiceApplication.find({ serviceId: service._id })
      .populate('applicantId', 'name email totalSp')
      .sort({ matchScore: -1, createdAt: -1 });

    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/services/:id/accept', populateStudentFromRequest, async (req, res) => {
  try {
    const { applicationId } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    if (String(service.buyerId) !== String(req.student._id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (service.status !== 'open') {
      return res.status(400).json({ error: 'Service is not open' });
    }

    const application = await ServiceApplication.findById(applicationId);
    if (!application || String(application.serviceId) !== String(service._id)) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application is not pending' });
    }

    await ServiceApplication.updateMany(
      { serviceId: service._id, _id: { $ne: applicationId } },
      { $set: { status: 'rejected' } }
    );

    await ServiceApplication.updateOne(
      { _id: applicationId },
      { $set: { status: 'accepted', respondedAt: new Date() } }
    );

    const updateResult = await Service.updateOne(
      { _id: service._id },
      {
        $set: {
          providerId: application.applicantId,
          providerEmail: application.applicantEmail.toLowerCase(),
          providerAcceptedAt: new Date(),
          status: 'assigned',
          estimatedPrice: application.proposedPrice
        }
      }
    );

    if (!updateResult.modifiedCount) {
      return res.status(500).json({ error: 'Failed to assign provider' });
    }

    let escrowResult;
    try {
      escrowResult = await holdInEscrow({
        serviceId: service._id,
        buyerId: service.buyerId,
        buyerEmail: service.buyerEmail,
        amount: application.proposedPrice,
        providerEmail: application.applicantEmail
      });
    } catch (escrowError) {
      await Service.updateOne(
        { _id: service._id },
        { $set: { status: 'open', providerId: null, providerEmail: null } }
      );
      return res.status(400).json({ error: escrowError.message || 'Escrow failed. Provider unassigned.' });
    }

    await getOrCreateReputation(application.applicantId, application.applicantEmail);

    res.json({ success: true, escrow: escrowResult });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/services/:id/complete', populateStudentFromRequest, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const isBuyer = String(service.buyerId?._id || service.buyerId) === String(req.student._id);
    const isProvider = String(service.providerId?._id || service.providerId) === String(req.student._id);

    if (!isBuyer && !isProvider) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (service.status !== 'assigned' && service.status !== 'in_progress') {
      return res.status(400).json({ error: 'Service cannot be marked complete' });
    }

    if (isProvider) {
      await Service.updateOne({ _id: service._id }, { $set: { status: 'in_progress' } });
      return res.json({ success: true, message: 'Service marked as in progress' });
    }

    await releaseEscrow({
      serviceId: service._id,
      providerId: service.providerId,
      providerEmail: service.providerEmail
    });

    await updateReputationAfterTransaction({
      serviceId: service._id,
      buyerId: service.buyerId,
      providerId: service.providerId,
      isSuccessful: true
    });

    res.json({ success: true, message: 'Service completed and payment released' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/estimate-price', async (req, res) => {
  try {
    const { category, difficulty, estimatedDuration, urgency, providerReputation } = req.body;

    if (!category || !estimatedDuration) {
      return res.status(400).json({ error: 'Category and duration are required' });
    }

    const result = await estimatePrice({ category, difficulty, estimatedDuration, urgency, providerReputation });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recommended-helpers', populateStudentFromRequest, async (req, res) => {
  try {
    const { serviceId, category, difficulty, limit = 5 } = req.query;

    let service;
    if (serviceId) {
      service = await Service.findById(serviceId);
      if (!service) return res.status(404).json({ error: 'Service not found' });
    } else if (category && difficulty) {
      service = {
        category,
        difficulty,
        estimatedDuration: 30,
        urgency: 'normal',
        buyerId: req.student._id
      };
    } else {
      return res.status(400).json({ error: 'serviceId or category/difficulty required' });
    }

    const helpers = await findRecommendedHelpers({ service, limit: Number(limit) });
    res.json({ helpers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reputation/:userId', async (req, res) => {
  try {
    const profile = await getReputationProfile(req.params.userId);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reviews/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [reviews, total] = await Promise.all([
      Review.find({ revieweeId: req.params.userId, isPublic: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('reviewerId', 'name email'),
      Review.countDocuments({ revieweeId: req.params.userId, isPublic: true })
    ]);

    res.json({ reviews, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reviews', populateStudentFromRequest, async (req, res) => {
  try {
    const { serviceId, rating, comment, tags } = req.body;

    if (!serviceId || !rating) {
      return res.status(400).json({ error: 'Service ID and rating are required' });
    }

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.status !== 'completed') return res.status(400).json({ error: 'Can only review completed services' });

    const isBuyer = String(service.buyerId?._id || service.buyerId) === String(req.student._id);
    const isProvider = String(service.providerId?._id || service.providerId) === String(req.student._id);
    if (!isBuyer && !isProvider) return res.status(403).json({ error: 'Not authorized' });

    const reviewer = await Student.findOne({ email: req.student.email });
    const revieweeId = isBuyer ? service.providerId : service.buyerId;
    const reviewee = await Student.findById(revieweeId);

    const existing = await Review.findOne({ serviceId, reviewerId: reviewer._id });
    if (existing) return res.status(400).json({ error: 'Already reviewed this service' });

    const review = await Review.create({
      serviceId,
      reviewerId: reviewer._id,
      reviewerEmail: reviewer.email.toLowerCase(),
      revieweeId,
      revieweeEmail: reviewee.email.toLowerCase(),
      rating,
      comment: comment || '',
      tags: tags || []
    });

    await updateSkillRating(revieweeId, service.category, rating);

    res.status(201).json({ success: true, review });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disputes', populateStudentFromRequest, async (req, res) => {
  try {
    const { serviceId, reason, description, evidence } = req.body;

    if (!serviceId || !reason || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const isBuyer = String(service.buyerId?._id || service.buyerId) === String(req.student._id);
    const isProvider = String(service.providerId?._id || service.providerId) === String(req.student._id);
    if (!isBuyer && !isProvider) return res.status(403).json({ error: 'Not authorized' });

    if (service.status === 'completed') return res.status(400).json({ error: 'Cannot dispute completed service' });

    const existing = await Dispute.findOne({ serviceId });
    if (existing) return res.status(400).json({ error: 'Dispute already exists for this service' });

    const student = await Student.findOne({ email: req.student.email });

    const dispute = await Dispute.create({
      serviceId,
      raisedBy: student._id,
      raisedByEmail: student.email.toLowerCase(),
      reason,
      description,
      evidence: evidence || [],
      escrowAmount: service.escrowAmount,
      affectedUsers: [
        { userId: service.buyerId, email: service.buyerEmail, impact: 'buyer' },
        { userId: service.providerId, email: service.providerEmail, impact: 'provider' }
      ]
    });

    await Service.updateOne({ _id: serviceId }, { $set: { status: 'disputed' } });

    res.status(201).json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/disputes/:id', populateStudentFromRequest, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    res.json({ dispute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disputes/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const { action, refundPercentage, reason } = req.body;

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      return res.status(400).json({ error: 'Dispute already resolved' });
    }

    const service = await Service.findById(dispute.serviceId);

    let refundResult;
    if (action === 'refund_buyer') {
      refundResult = await refundEscrow({
        serviceId: dispute.serviceId,
        buyerId: service.buyerId,
        buyerEmail: service.buyerEmail,
        reason: `Dispute resolved: ${reason}`
      });
    } else if (action === 'release_to_provider') {
      refundResult = await releaseEscrow({
        serviceId: dispute.serviceId,
        providerId: service.providerId,
        providerEmail: service.providerEmail
      });
    } else if (action === 'split') {
      const buyerRefund = Math.round(dispute.escrowAmount * (refundPercentage / 100));
      const providerShare = dispute.escrowAmount - buyerRefund;

      if (buyerRefund > 0) {
        await refundEscrow({
          serviceId: dispute.serviceId,
          buyerId: service.buyerId,
          buyerEmail: service.buyerEmail,
          reason: `Dispute resolved (partial refund): ${reason}`
        });
      }
      if (providerShare > 0) {
        await releaseEscrow({
          serviceId: dispute.serviceId,
          providerId: service.providerId,
          providerEmail: service.providerEmail
        });
      }
    }

    await Dispute.updateOne(
      { _id: dispute._id },
      {
        $set: {
          status: 'resolved',
          resolution: { action, refundPercentage: refundPercentage || 0, reason, resolvedAt: new Date() }
        }
      }
    );

    res.json({ success: true, resolution: refundResult });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-services', populateStudentFromRequest, async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.student.email });
    const services = await Service.find({ buyerId: student._id })
      .sort({ createdAt: -1 })
      .populate('providerId', 'name email');
    res.json({ services });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-applications', populateStudentFromRequest, async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.student.email });
    const applications = await ServiceApplication.find({ applicantId: student._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'serviceId',
        populate: { path: 'buyerId', select: 'name email' }
      });
    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-ongoing', populateStudentFromRequest, async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.student.email });
    const [asBuyer, asProvider] = await Promise.all([
      Service.find({ buyerId: student._id, status: { $in: ['assigned', 'in_progress'] } })
        .populate('providerId', 'name email'),
      Service.find({ providerId: student._id, status: { $in: ['assigned', 'in_progress'] } })
        .populate('buyerId', 'name email')
    ]);
    res.json({ asBuyer, asProvider });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/top-helpers', async (req, res) => {
  try {
    const { category, limit = 10 } = req.query;
    const helpers = await getTopHelpers({ category, limit: Number(limit) });
    res.json({ helpers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics/overview', populateStudentFromRequest, async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.student.email });
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      myServices,
      myApplications,
      completedAsProvider,
      transactions
    ] = await Promise.all([
      Service.countDocuments({ buyerId: student._id }),
      ServiceApplication.countDocuments({ applicantId: student._id }),
      Service.countDocuments({ providerId: student._id, status: 'completed' }),
      MarketplaceTransaction.find({ email: student.email.toLowerCase() })
        .sort({ dateTime: -1 })
        .limit(50)
    ]);

    res.json({
      stats: {
        myServices,
        myApplications,
        completedAsProvider,
        recentTransactions: transactions.length
      },
      recentTransactions: transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const CATEGORY_SEED_DATA = [
  { name: 'Doubt Clearing', icon: '❓', description: 'Get your doubts clarified by experts', color: '#10b981', basePrice: 10, sortOrder: 1 },
  { name: 'Coding Help', icon: '💻', description: 'Programming assistance and code reviews', color: '#3b82f6', basePrice: 25, sortOrder: 2 },
  { name: 'Debugging', icon: '🐛', description: 'Fix bugs and issues in your code', color: '#ef4444', basePrice: 20, sortOrder: 3 },
  { name: 'Assignment Review', icon: '📝', description: 'Get feedback on your assignments', color: '#8b5cf6', basePrice: 15, sortOrder: 4 },
  { name: 'Mock Interviews', icon: '🎯', description: 'Practice interviews with peers', color: '#f59e0b', basePrice: 40, sortOrder: 5 },
  { name: 'Resume Review', icon: '📄', description: 'Get expert feedback on your resume', color: '#06b6d4', basePrice: 30, sortOrder: 6 },
  { name: 'Documentation', icon: '📚', description: 'Create or improve documentation', color: '#84cc16', basePrice: 15, sortOrder: 7 },
  { name: 'UI Design', icon: '🎨', description: 'UI/UX design assistance', color: '#ec4899', basePrice: 30, sortOrder: 8 },
  { name: 'Research Assistance', icon: '🔬', description: 'Help with research and projects', color: '#6366f1', basePrice: 35, sortOrder: 9 },
  { name: 'Presentation Creation', icon: '📊', description: 'Create stunning presentations', color: '#14b8a6', basePrice: 20, sortOrder: 10 },
  { name: 'Note Making', icon: '📒', description: 'Structured notes for any topic', color: '#a855f7', basePrice: 10, sortOrder: 11 },
  { name: 'Language Translation', icon: '🌐', description: 'Translate content between languages', color: '#f97316', basePrice: 15, sortOrder: 12 },
  { name: 'Peer Tutoring', icon: '👨‍🏫', description: 'One-on-one tutoring sessions', color: '#0ea5e9', basePrice: 20, sortOrder: 13 },
  { name: 'Career Guidance', icon: '🚀', description: 'Get career advice and mentorship', color: '#84cc16', basePrice: 35, sortOrder: 14 },
  { name: 'Mathematics', icon: '🔢', description: 'Math problem solving and tutoring', color: '#8b5cf6', basePrice: 15, sortOrder: 15 },
  { name: 'AI & Machine Learning', icon: '🤖', description: 'AI/ML project help and tutoring', color: '#ef4444', basePrice: 40, sortOrder: 16 },
  { name: 'Video Editing', icon: '🎬', description: 'Video editing and production help', color: '#f59e0b', basePrice: 25, sortOrder: 17 },
  { name: 'Public Speaking', icon: '🎤', description: 'Practice and improve speaking skills', color: '#06b6d4', basePrice: 20, sortOrder: 18 }
];

router.post('/seed-categories', requireAdmin, async (req, res) => {
  try {
    let count = 0;
    for (const cat of CATEGORY_SEED_DATA) {
      await ServiceCategory.findOneAndUpdate({ name: cat.name }, cat, { upsert: true, new: true });
      count++;
    }
    res.json({ success: true, seeded: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services/:id/messages', populateStudentFromRequest, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const isBuyer = String(service.buyerId?._id || service.buyerId) === String(req.student._id);
    const isProvider = String(service.providerId?._id || service.providerId) === String(req.student._id);
    const hasAcceptedApp = await ServiceApplication.findOne({
      serviceId: service._id,
      applicantId: req.student._id,
      status: 'accepted'
    });
    const isParticipant = isBuyer || isProvider || !!hasAcceptedApp;

    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    res.json({ messages: service.messages || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/services/:id/messages', populateStudentFromRequest, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const isBuyer = String(service.buyerId?._id || service.buyerId) === String(req.student._id);
    const isProvider = String(service.providerId?._id || service.providerId) === String(req.student._id);
    const hasAcceptedApp = await ServiceApplication.findOne({
      serviceId: service._id,
      applicantId: req.student._id,
      status: 'accepted'
    });
    const isParticipant = isBuyer || isProvider || !!hasAcceptedApp;

    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    const newMessage = {
      senderId: req.student._id,
      senderEmail: req.student.email,
      senderName: req.student.name,
      text: text.trim(),
      isSystem: false,
      createdAt: new Date()
    };

    await Service.updateOne(
      { _id: service._id },
      { $push: { messages: newMessage } }
    );

    res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;