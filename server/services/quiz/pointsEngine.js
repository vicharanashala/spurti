import Student from '../../models/Student.js';
import SPTransaction from '../../models/SPTransaction.js';

/**
 * Calculates SP points earned based on quiz score.
 * 0-2 correct -> 0 SP
 * 3 correct -> 3 SP
 * 4 correct -> 4 SP
 * 5 correct -> 5 SP
 * 
 * @param {number} score - Number of correct answers (0 to 5).
 * @returns {number} The SP points to award.
 */
export function calculateSpPoints(score) {
  if (score >= 3 && score <= 5) {
    return score; // 3 -> 3 SP, 4 -> 4 SP, 5 -> 5 SP
  }
  return 0; // 0-2 -> 0 SP
}

/**
 * Applies quiz score points to student's SP bank and creates a transaction log.
 * 
 * @param {string} studentId - The ID of the student.
 * @param {object} quiz - The quiz document.
 * @param {number} score - The student's quiz score.
 * @returns {Promise<object|null>} The created SPTransaction or null if no points were awarded.
 */
export async function applyQuizPoints(studentId, quiz, score) {
  const delta = calculateSpPoints(score);
  
  if (delta === 0) {
    console.log(`ℹ️ Quiz score ${score}/5 resulted in 0 SP delta. No transaction created.`);
    return null;
  }

  // Retrieve student and update totalSp in a transaction-safe manner
  const student = await Student.findById(studentId);
  if (!student) {
    throw new Error('Student not found');
  }

  const balanceAfter = student.totalSp + delta;

  const txn = await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'manual', // fits 'manual' in the SPTransaction category enum
    sessionLabel: quiz.sessionLabel,
    deltaMode: 'absolute',
    deltaValue: delta,
    appliedDelta: delta,
    balanceAfter,
    reason: `SP Booster Quiz (${quiz.sessionLabel}): scored ${score}/5. Credited +${delta} SP.`,
    dateTime: new Date()
  });

  // Save the student updates
  student.totalSp = balanceAfter;
  if (balanceAfter > student.highestSpEver) {
    student.highestSpEver = balanceAfter;
  }
  await student.save();

  console.log(`💰 Credited +${delta} SP to student ${student.email}. New total: ${balanceAfter}`);
  return txn;
}
