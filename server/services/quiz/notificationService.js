/**
 * Notification Service Module
 * Handles dispatching notifications to learners.
 * 
 * Future Integration Note:
 * This is the ONLY file that needs modification to change how notifications are delivered.
 * You can easily integrate:
 * 1. Email notifications (e.g. Nodemailer, SendGrid, SES).
 * 2. Mobile push notifications (e.g. Firebase Cloud Messaging).
 * 3. SMS or instant messenger alerts (e.g. Twilio, Telegram Bot, WhatsApp API).
 */

import SessionEvent from '../../models/SessionEvent.js';
import Student from '../../models/Student.js';

/**
 * Sends a notification to all active students.
 * @param {string} message - The notification message.
 * @param {object} quiz - The scheduled quiz document.
 */
export async function sendNotification(message, quiz) {
  console.log(`\n🔔 [NOTIFICATION ALERT] 🔔`);
  console.log(`Message: "${message}"`);
  console.log(`Quiz for session: "${quiz.sessionLabel}" starts at ${new Date(quiz.startTime).toLocaleTimeString()}`);
  console.log(`===========================\n`);

  try {
    // Log a notification event in the database for active student telemetry.
    // This makes the notification queryable via user-facing APIs.
    const activeStudents = await Student.find({ status: 'active' }, { email: 1, name: 1 });
    
    const events = activeStudents.map(student => ({
      email: student.email,
      name: student.name,
      event: 'quiz_notification',
      page: 'quiz',
      recordViewed: String(quiz._id)
    }));

    if (events.length > 0) {
      await SessionEvent.insertMany(events);
      console.log(`💾 Persisted quiz notification events for ${events.length} active students.`);
    }
  } catch (err) {
    console.error('❌ Failed to persist notification events:', err.message);
  }
}
