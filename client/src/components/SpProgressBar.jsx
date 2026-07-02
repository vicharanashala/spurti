import React from 'react';

export function calculateMaxSp(startDateStr, currentDateStr = null) {
  if (!startDateStr) return 20;
  const startDate = new Date(startDateStr);
  const today = currentDateStr ? new Date(currentDateStr) : new Date();
  
  const startMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = todayMidnight - startMidnight;
  const daysActive = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
  return daysActive * 20;
}

export default function SpProgressBar({ totalSp = 0, internshipStartDate }) {
  const maxSp = calculateMaxSp(internshipStartDate);
  const pct = maxSp > 0 ? Math.round((totalSp / maxSp) * 100) : 0;
  const widthPct = Math.min(100, Math.max(0, pct));

  let motivationText = '';
  if (pct >= 90) {
    motivationText = "Phenomenal consistency! You are leading the charge. 🚀";
  } else if (pct >= 75) {
    motivationText = "Excellent participation energy! Keep holding the line. 🔥";
  } else if (pct >= 50) {
    motivationText = "Good progress! You are on track, keep showing up! 💪";
  } else if (pct >= 30) {
    motivationText = "You're getting there. Boost attendance to unlock higher levels! 📈";
  } else {
    motivationText = "Every day counts. Attend upcoming sessions to build your momentum. ⚡";
  }

  return (
    <div className="pulse-card wide-pulse progress-bar-section">
      <span>SP Energy Progress</span>
      <div className="progress-bar-meta">
        <strong>{totalSp} / {maxSp} SP</strong>
        <span>{pct}% of Max Possible</span>
      </div>
      <div className="progress-bar-container" data-testid="progress-container">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${widthPct}%` }}
          data-testid="progress-fill"
        />
      </div>
      <p className="progress-motivation" data-testid="progress-motivation">
        {motivationText}
      </p>
    </div>
  );
}
