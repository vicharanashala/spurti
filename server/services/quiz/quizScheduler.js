import Quiz from '../../models/Quiz.js';
import Session from '../../models/Session.js';
import { getMorningTranscript } from './transcriptProvider.js';
import { generateQuiz } from './quizGenerator.js';
import { sendNotification } from './notificationService.js';

/**
 * Schedules a quiz for a completed morning session.
 * Generates a random start time (1 to 4 hours after the session ends)
 * and generates the quiz questions.
 * 
 * Future Integration Note:
 * This method can be called in the ingestion pipeline after a new session is added.
 */
export async function scheduleQuizForSession(session) {
  if (session.type !== 'morning') {
    return null; // Only morning sessions get quizzes
  }

  // Check if a quiz is already scheduled for this session
  const existing = await Quiz.findOne({ sessionLabel: session.label });
  if (existing) {
    console.log(`ℹ️ Quiz already scheduled for session: ${session.label}`);
    return existing;
  }

  console.log(`📅 Scheduling quiz for session: ${session.label}`);

  // Generate random start time: between 1 and 4 hours after session end
  const sessionEnd = new Date(session.endDateTime);
  const randomDelayMs = (1 + Math.random() * 3) * 60 * 60 * 1000; // 1 to 4 hours
  const startTime = new Date(sessionEnd.getTime() + randomDelayMs);

  try {
    const transcript = await getMorningTranscript(session.label);
    const questions = await generateQuiz(transcript);

    const quiz = await Quiz.create({
      sessionLabel: session.label,
      transcript,
      questions,
      startTime,
      durationMinutes: 15
    });

    console.log(`✅ Successfully scheduled quiz for "${session.label}" at ${startTime.toISOString()}`);
    return quiz;
  } catch (err) {
    console.error(`❌ Failed to schedule quiz for session "${session.label}":`, err.message);
    throw err;
  }
}

/**
 * Background worker task: Checks for scheduled quizzes starting in 1 hour (or less)
 * and sends student notifications if they haven't been sent yet.
 * 
 * Future Integration Note:
 * This can be run on a node-cron job or a simple setInterval in server.js.
 */
export async function checkAndSendNotifications() {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  try {
    // Find quizzes starting within 1 hour that have not been notified
    const quizzesToNotify = await Quiz.find({
      notifiedAt: null,
      startTime: { $lte: oneHourFromNow }
    });

    if (quizzesToNotify.length === 0) return;

    console.log(`🔔 Found ${quizzesToNotify.length} quizzes to send notifications for.`);

    for (const quiz of quizzesToNotify) {
      await sendNotification("Your SP Booster Quiz starts in 1 hour.", quiz);
      quiz.notifiedAt = new Date();
      await quiz.save();
      console.log(`✅ Notification status updated for quiz: ${quiz.sessionLabel}`);
    }
  } catch (err) {
    console.error('❌ Error during quiz notification check:', err.message);
  }
}
