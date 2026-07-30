import { ENGAGEMENT_BANDS, ENGAGEMENT_THRESHOLDS, ROLLING_WINDOW_SIZE } from './config.js';

function avg(arr, key) {
  const vals = arr.map(s => s[key]).filter(v => v !== null && v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function isDeclining(window) {
  if (window.length < 2) return false;
  const att = window.map(s => s.attendancePct).filter(v => v !== null);
  const sp = window.map(s => s.spDelta);
  if (att.length >= 2 && att[att.length - 1] < att[0]) return true;
  if (sp.length >= 2 && sp[sp.length - 1] < sp[0]) return true;
  return false;
}

function isImproving(window) {
  if (window.length < 2) return false;
  const att = window.map(s => s.attendancePct).filter(v => v !== null);
  const sp = window.map(s => s.spDelta);
  if (att.length >= 2 && att[att.length - 1] > att[0]) return true;
  if (sp.length >= 2 && sp[sp.length - 1] > sp[0]) return true;
  return false;
}

function hasData(window) {
  return window.length > 0 && window.some(s => s.attendancePct !== null);
}

export function classifyBand(currentWindow, previousWindow = []) {
  if (!hasData(currentWindow)) {
    return { band: ENGAGEMENT_BANDS.ACTIVE, reason: 'No attendance data available yet' };
  }

  const avgAtt = avg(currentWindow, 'attendancePct');
  const avgSp = avg(currentWindow, 'spDelta');
  const declining = isDeclining(currentWindow);
  const improving = isImproving(currentWindow);

  if (previousWindow.length > 0) {
    const prev = classifyBand(previousWindow);
    if (prev.band === ENGAGEMENT_BANDS.SLOWING_DOWN && improving) {
      return {
        band: ENGAGEMENT_BANDS.RECOVERY,
        reason: `Attendance improved to ${Math.round(avgAtt)}%, SP trend reversing — recovered from Slowing Down`,
        stats: { avgAttendancePct: Math.round(avgAtt), avgSpPerSession: Math.round(avgSp * 10) / 10 }
      };
    }
  }

  if (avgAtt >= ENGAGEMENT_THRESHOLDS.excellent.minAttendancePct && avgSp >= ENGAGEMENT_THRESHOLDS.excellent.minSpPerSession) {
    return {
      band: ENGAGEMENT_BANDS.EXCELLENT,
      reason: `Avg attendance ${Math.round(avgAtt)}% (≥90%), avg SP +${Math.round(avgSp)} per session`,
      stats: { avgAttendancePct: Math.round(avgAtt), avgSpPerSession: Math.round(avgSp * 10) / 10 }
    };
  }

  if (avgAtt >= ENGAGEMENT_THRESHOLDS.active.minAttendancePct && avgSp >= ENGAGEMENT_THRESHOLDS.active.minSpPerSession) {
    const trendNote = declining ? ' but showing early decline signs' : ' — steady engagement';
    return {
      band: ENGAGEMENT_BANDS.ACTIVE,
      reason: `Avg attendance ${Math.round(avgAtt)}% (≥75%), avg SP +${Math.round(avgSp)} per session${trendNote}`,
      stats: { avgAttendancePct: Math.round(avgAtt), avgSpPerSession: Math.round(avgSp * 10) / 10 }
    };
  }

  const declineNote = declining ? 'trend declining' : 'below active thresholds';
  return {
    band: ENGAGEMENT_BANDS.SLOWING_DOWN,
    reason: `Attendance at ${Math.round(avgAtt)}%, SP +${Math.round(avgSp)}/session — ${declineNote}`,
    stats: { avgAttendancePct: Math.round(avgAtt), avgSpPerSession: Math.round(avgSp * 10) / 10 }
  };
}
