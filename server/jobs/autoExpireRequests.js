import mongoose from 'mongoose';
import FlexibleDayRequest from '../models/FlexibleDayRequest.js';

export async function autoExpireFlexibleDayRequests() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expiredRequests = await FlexibleDayRequest.find({
      status: 'PENDING',
      requestedAt: { $lt: twentyFourHoursAgo }
    });

    if (expiredRequests.length === 0) {
      return 0;
    }

    const now = new Date();
    let count = 0;

    for (const req of expiredRequests) {
      req.status = 'AUTO_EXPIRED';
      req.autoExpiredAt = now;
      await req.save();
      count++;

      // Create notification for student
      try {
        const notificationsCollection = mongoose.connection.collection('notifications');
        await notificationsCollection.insertOne({
          recipientId: req.studentId,
          type: 'FLEXIBLE_DAY_AUTO_EXPIRED',
          payload: {
            sessionLabel: req.sessionLabel,
            message: 'Your request was not responded to in time and has been automatically cancelled. No SP was deducted.'
          },
          createdAt: now
        });
      } catch {
        // Best-effort notification
      }
    }

    console.log(`Auto-expired ${count} pending flexible day request(s) older than 24 hours.`);
    return count;
  } catch (err) {
    console.error('Error auto-expiring flexible day requests:', err?.message);
    return 0;
  }
}

let cronInterval = null;

export function startAutoExpireCron(intervalMs = 30 * 60 * 1000) {
  // Run once immediately on start
  autoExpireFlexibleDayRequests();

  if (!cronInterval) {
    cronInterval = setInterval(() => {
      autoExpireFlexibleDayRequests();
    }, intervalMs);
  }
}
