/**
 * Spurti Weekly SP Pulse.
 *
 * These are DERIVED VIEWS over the existing SP system — pure functions, no DB,
 * no side effects. SP transactions and balances are never changed here.
 * Calculates rolling 7-day breakdown of a student's SP and determines the weekly torch holder.
 */

export function weeklySpBreakdown(transactions = [], options = {}) {
  const referenceDate = options.referenceDate || new Date();
  const windowDays = options.windowDays || 7;
  
  const cutoffTime = referenceDate.getTime() - (windowDays * 24 * 60 * 60 * 1000);

  const windowTransactions = (transactions || []).filter(tx => {
    const txTime = new Date(tx.dateTime).getTime();
    return txTime >= cutoffTime && txTime <= referenceDate.getTime();
  });

  const categoryMap = {};
  let overallNet = 0;
  let overallGained = 0;
  let overallLost = 0;
  
  const debits = [];

  for (const tx of windowTransactions) {
    const delta = Number(tx.appliedDelta) || 0;
    const cat = tx.category || 'unknown';

    if (!categoryMap[cat]) {
      categoryMap[cat] = { netSp: 0, credits: 0, debits: 0 };
    }

    categoryMap[cat].netSp += delta;
    overallNet += delta;

    if (delta > 0) {
      categoryMap[cat].credits += delta;
      overallGained += delta;
    } else if (delta < 0) {
      categoryMap[cat].debits += Math.abs(delta);
      overallLost += Math.abs(delta);
      debits.push({
        reason: tx.reason,
        sessionLabel: tx.sessionLabel || '',
        amount: Math.abs(delta)
      });
    }
  }

  // topLossReasons: the 3 biggest single debits, most-negative first.
  debits.sort((a, b) => b.amount - a.amount);
  const topLossReasons = debits.slice(0, 3);

  return {
    windowDays,
    netSp: overallNet,
    gained: overallGained,
    lost: overallLost,
    byCategory: categoryMap,
    topLossReasons
  };
}

export function weeklyTorchHolder(deltaRows = []) {
  if (!deltaRows || deltaRows.length === 0) return null;

  let winner = null;

  for (const row of deltaRows) {
    if (row.netSp > 0) {
      if (!winner || row.netSp > winner.netSp) {
        // If there's a tie for highest netSp, pick the first one encountered implicitly
        // by strictly checking `row.netSp > winner.netSp`
        winner = row;
      }
    }
  }

  return winner;
}
