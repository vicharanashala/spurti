// Lightweight in-process scheduler for the weekly recap. Runs every
// 5 minutes; if the previous week has never been finalized AND we
// are past Monday 06:00 IST, finalize it. Idempotent — safe to run
// concurrently with other schedulers.
import { finalizePreviousWeek } from './weeklyRecap.js';

const TICK_MS = 5 * 60 * 1000;
let _handle = null;

function shouldFinalize(now) {
  // We're past Monday 06:00 IST when (current weekday > Monday) OR
  // (today is Monday AND current IST hour >= 6). The function used
  // to compute this is the inverse of `phase === 'pre-start'`.
  const IST_OFFSET_MIN = 330;
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const day = shifted.getUTCDay(); // 0..6 (Sun..Sat)
  const hr = shifted.getUTCHours();
  if (day === 1 && hr < 6) return false; // Monday before 06:00
  return true;
}

async function tick() {
  try {
    const now = new Date();
    if (!shouldFinalize(now)) return;
    const recap = await finalizePreviousWeek();
    console.log(`[recap] finalized ${recap?.weekStart} · ${recap?.top10?.length || 0} winners · cohort ${recap?.cohortSize}`);
  } catch (err) {
    console.error('[recap] tick failed:', err?.message);
  }
}

export function startWeeklyRecapScheduler() {
  if (_handle) return;
  tick();
  _handle = setInterval(tick, TICK_MS);
  console.log('[recap] scheduler started');
}

export function stopWeeklyRecapScheduler() {
  if (_handle) { clearInterval(_handle); _handle = null; }
}