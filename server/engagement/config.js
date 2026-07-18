export const ROLLING_WINDOW_SIZE = 3;

export const ATTENDANCE_BANDS = [
  { label: 'excellent', minPct: 90 },
  { label: 'good',      minPct: 75 },
  { label: 'fair',      minPct: 50 },
  { label: 'low',       minPct: 0 }
];

export const SP_DELTA_BANDS = [
  { label: 'strong',     minDelta: 10 },
  { label: 'moderate',   minDelta: 5 },
  { label: 'slight',     minDelta: 3 },
  { label: 'none',       minDelta: 0 }
];

export const ENGAGEMENT_BANDS = {
  EXCELLENT:   'Excellent',
  ACTIVE:      'Active',
  SLOWING_DOWN: 'Slowing Down',
  RECOVERY:    'Recovery'
};

export const ENGAGEMENT_THRESHOLDS = {
  excellent: {
    minAttendancePct: 90,
    minSpPerSession: 8,
    description: 'High attendance and strong SP gain across the window'
  },
  active: {
    minAttendancePct: 75,
    minSpPerSession: 3,
    description: 'Consistent attendance and moderate SP gain'
  },
  slowingDown: {
    maxAttendancePct: 74,
    maxSpPerSession: 2,
    decliningTrendRequired: true,
    description: 'Declining attendance or SP trend over the window'
  },
  recovery: {
    minAttendancePct: 75,
    priorBandRequired: 'Slowing Down',
    description: 'Improved from a prior Slowing Down trend'
  }
};
