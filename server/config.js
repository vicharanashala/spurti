import 'dotenv/config';

export const PORT = Number(process.env.PORT || 5290);
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';
export const ALLOW_STUDENT_SEARCH = process.env.ALLOW_STUDENT_SEARCH !== 'false';
// Samagama validates the student's chatengine_token cookie. Spurti reads that
// cookie and confirms the session against this internal endpoint (same host).
export const SAMAGAMA_AUTH_URL = process.env.SAMAGAMA_AUTH_URL || 'http://127.0.0.1:5001/api/auth/me';

export const SESSION_LABELS = [
  'Orientation (15 May)',
  'Day 1 (16 May)',
  'Day 2 (17 May)',
  'Day 3 (18 May)',
  'Day 4 (19 May)',
  'Day 5 (20 May)',
  'Day 6 (21 May)',
  'Day 7 (22 May)'
];

export const SESSION_DURATIONS = {
  'Orientation (15 May)': 250,
  'Day 1 (16 May)': 261,
  'Day 2 (17 May)': 111,
  'Day 3 (18 May)': 117,
  'Day 4 (19 May)': 95,
  'Day 5 (20 May)': 121,
  'Day 6 (21 May)': 81,
  'Day 7 (22 May)': 240
};

// Session end times from Zoom CSV headers — used for ordering and onboarding filter
export const SESSION_DATETIME_MAP = {
  'Orientation (15 May)': '2026-05-15T12:37:30',
  'Day 1 (16 May)': '2026-05-16T12:16:32',
  'Day 2 (17 May)': '2026-05-17T22:33:56',
  'Day 3 (18 May)': '2026-05-18T11:00:14',
  'Day 4 (19 May)': '2026-05-19T10:35:17',
  'Day 5 (20 May)': '2026-05-20T11:04:39',
  'Day 6 (21 May)': '2026-05-21T11:00:00',
  'Day 7 (22 May)': '2026-05-22T13:00:00'
};

// Per-session attendance threshold in MINUTES (used as fixed override for specific sessions)
export const SESSION_THRESHOLDS_MINUTES = {
  'Day 2 (17 May)': 50
};

export const SESSION_THRESHOLDS_PCT = 0.75; // default % of session duration to qualify
