import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import MarketplaceTransaction from '../models/MarketplaceTransaction.js';
import Service from '../models/Service.js';
import crypto from 'crypto';

const ESCROW_TIMEOUT_HOURS = 72;

export async function holdInEscrow({ serviceId, buyerId, buyerEmail, amount, providerEmail }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const student = await Student.findOne({ _id: buyerId }).session(session);
    if (!student) throw new Error('Buyer not found');
    if (student.totalSp < amount) throw new Error('Insufficient SP balance');

    const newBalance = student.totalSp - amount;
    await Student.updateOne({ _id: buyerId }, { $set: { totalSp: newBalance } }).session(session);

    const escrowId = crypto.randomBytes(12).toString('hex');
    const now = new Date();

    await MarketplaceTransaction.create([{
      email: buyerEmail,
      studentId: buyerId,
      serviceId,
      type: 'escrow_hold',
      amount: -amount,
      balanceAfter: newBalance,
      reason: `Escrow held for service request`,
      counterpartyEmail: providerEmail || '',
      counterpartyServiceRole: 'buyer',
      escrowId,
      status: 'completed',
      dateTime: now
    }], { session });

    await Service.updateOne(
      { _id: serviceId },
      { $set: { escrowAmount: amount, escrowHeldAt: now, status: 'assigned' } }
    ).session(session);

    await session.commitTransaction();

    return {
      success: true,
      escrowId,
      heldAmount: amount,
      newBalance,
      expiresAt: new Date(now.getTime() + ESCROW_TIMEOUT_HOURS * 60 * 60 * 1000)
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function releaseEscrow({ serviceId, providerId, providerEmail }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const service = await Service.findOne({ _id: serviceId }).session(session);
    if (!service) throw new Error('Service not found');
    if (service.status !== 'assigned' && service.status !== 'in_progress') {
      throw new Error('Service is not in a releasable state');
    }

    const amount = service.escrowAmount;
    const buyerEmail = service.buyerEmail;

    const provider = await Student.findOne({ _id: providerId }).session(session);
    if (!provider) throw new Error('Provider not found');

    const providerNewBalance = provider.totalSp + amount;
    await Student.updateOne({ _id: providerId }, { $set: { totalSp: providerNewBalance } }).session(session);

    const now = new Date();

    await MarketplaceTransaction.create([{
      email: providerEmail,
      studentId: providerId,
      serviceId,
      type: 'escrow_release',
      amount: amount,
      balanceAfter: providerNewBalance,
      reason: `Payment received for completing: ${service.title}`,
      counterpartyEmail: buyerEmail,
      counterpartyServiceRole: 'provider',
      status: 'completed',
      dateTime: now
    }], { session });

    await Service.updateOne(
      { _id: serviceId },
      { $set: { status: 'completed', completedAt: now, escrowAmount: 0 } }
    ).session(session);

    await session.commitTransaction();

    return {
      success: true,
      releasedAmount: amount,
      providerNewBalance,
      completedAt: now
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function refundEscrow({ serviceId, buyerId, buyerEmail, reason }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const service = await Service.findOne({ _id: serviceId }).session(session);
    if (!service) throw new Error('Service not found');

    const amount = service.escrowAmount;
    if (amount <= 0) throw new Error('No escrow to refund');

    const buyer = await Student.findOne({ _id: buyerId }).session(session);
    if (!buyer) throw new Error('Buyer not found');

    const buyerNewBalance = buyer.totalSp + amount;
    await Student.updateOne({ _id: buyerId }, { $set: { totalSp: buyerNewBalance } }).session(session);

    const now = new Date();

    await MarketplaceTransaction.create([{
      email: buyerEmail,
      studentId: buyerId,
      serviceId,
      type: 'escrow_refund',
      amount: amount,
      balanceAfter: buyerNewBalance,
      reason: reason || 'Escrow refunded due to service cancellation',
      counterpartyEmail: service.providerEmail || '',
      counterpartyServiceRole: 'system',
      status: 'completed',
      dateTime: now
    }], { session });

    await Service.updateOne(
      { _id: serviceId },
      { $set: { status: 'cancelled', escrowAmount: 0 } }
    ).session(session);

    await session.commitTransaction();

    return {
      success: true,
      refundedAmount: amount,
      newBalance: buyerNewBalance,
      reason: reason || 'Service cancelled'
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function getEscrowStatus(serviceId) {
  const service = await Service.findById(serviceId);
  if (!service) return null;

  const isExpired = service.escrowHeldAt &&
    (Date.now() - service.escrowHeldAt.getTime()) > ESCROW_TIMEOUT_HOURS * 60 * 60 * 1000;

  return {
    hasEscrow: service.escrowAmount > 0,
    amount: service.escrowAmount,
    heldAt: service.escrowHeldAt,
    isExpired,
    status: service.status
  };
}

export async function processExpiredEscrows() {
  const expiredServices = await Service.find({
    escrowAmount: { $gt: 0 },
    escrowHeldAt: { $lt: new Date(Date.now() - ESCROW_TIMEOUT_HOURS * 60 * 60 * 1000) },
    status: 'assigned'
  });

  const results = [];
  for (const service of expiredServices) {
    try {
      const result = await refundEscrow({
        serviceId: service._id,
        buyerId: service.buyerId,
        buyerEmail: service.buyerEmail,
        reason: 'Escrow expired - provider did not respond in time'
      });
      results.push({ serviceId: service._id, ...result });
    } catch (error) {
      results.push({ serviceId: service._id, error: error.message });
    }
  }

  return results;
}