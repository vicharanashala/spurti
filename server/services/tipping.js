/**
 * Pure validation function for Peer-to-Peer SP Tipping.
 * 
 * All DB reads happen in the route handler, and all DB writes happen in the 
 * route handler after validation passes. This function only validates business 
 * rules given already-fetched data.
 */

export function validateTip({ fromStudent, toStudent, amount, recentTipsSent, recentTipsToRecipient, lastTipDateTime }) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
    return { ok: false, reason: 'Tip amount must be a whole number between 1 and 10.' };
  }

  if (fromStudent.email === toStudent.email) {
    return { ok: false, reason: 'You cannot tip yourself.' };
  }

  if (fromStudent.status === 'excused' || toStudent.status === 'excused') {
    return { ok: false, reason: 'Cannot send or receive tips from excused accounts.' };
  }

  if ((fromStudent.totalSp - amount) < 20) {
    return { ok: false, reason: 'You must maintain a minimum balance of 20 SP to send a tip.' };
  }

  if ((recentTipsSent + amount) > 20) {
    return { ok: false, reason: 'You can only send up to 20 SP in tips per week.' };
  }

  if ((recentTipsToRecipient + amount) > 5) {
    return { ok: false, reason: 'You can only tip the same student up to 5 SP per week.' };
  }

  if (lastTipDateTime && (Date.now() - new Date(lastTipDateTime).getTime() < 5000)) {
    return { ok: false, reason: 'Please wait a few seconds before sending another tip.' };
  }

  return { ok: true };
}
