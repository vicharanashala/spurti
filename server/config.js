import 'dotenv/config';

export const PORT = Number(process.env.PORT || 5290);
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';
export const ALLOW_STUDENT_SEARCH = process.env.ALLOW_STUDENT_SEARCH !== 'false';
// Samagama validates the student's chatengine_token cookie. Spurti reads that
// cookie and confirms the session against this internal endpoint (same host).
export const SAMAGAMA_AUTH_URL = process.env.SAMAGAMA_AUTH_URL || 'http://127.0.0.1:5001/api/auth/me';

// HMAC secret for the local `spurti_session` cookie issued by /api/confirm
// when a student logs in via the search flow (no Samagama cookie available).
export const SESSION_SECRET = process.env.SESSION_SECRET || 'spurti-dev-secret-change-me-in-prod';

export const SESSION_LABELS = [
  '15 May Morning',
  '15 May Evening',
  '16 May Morning',
  '16 May Evening',
  '17 May Evening',
  '18 May Morning',
  '19 May Morning',
  '20 May Morning',
  '21 May Morning',
  '21 May Followup',
  '22 May Morning',
  '22 May Afternoon',
  '22 May Evening'
];

export const SESSION_DURATIONS = {
  '15 May Morning': 250,
  '15 May Evening': 225,
  '16 May Morning': 261,
  '16 May Evening': 231,
  '17 May Evening': 111,
  '18 May Morning': 117,
  '19 May Morning': 95,
  '20 May Morning': 121,
  '21 May Morning': 81,
  '21 May Followup': 70,
  '22 May Morning': 240,
  '22 May Afternoon': 140,
  '22 May Evening': 127
};

// Session end times from Zoom CSV headers — used for ordering and onboarding filter
export const SESSION_DATETIME_MAP = {
  '15 May Morning': '2026-05-15T12:37:30',
  '15 May Evening': '2026-05-15T17:14:45',
  '16 May Morning': '2026-05-16T12:16:32',
  '16 May Evening': '2026-05-16T17:50:51',
  '17 May Evening': '2026-05-17T22:33:56',
  '18 May Morning': '2026-05-18T11:00:14',
  '19 May Morning': '2026-05-19T10:35:17',
  '20 May Morning': '2026-05-20T11:04:39',
  '21 May Morning': '2026-05-21T11:00:00',
  '21 May Followup': '2026-05-21T12:00:00',
  '22 May Morning': '2026-05-22T13:00:00',
  '22 May Afternoon': '2026-05-22T16:20:00',
  '22 May Evening': '2026-05-22T18:36:50'
};

// Per-session attendance threshold in MINUTES (null = use 75% of duration)
// "17 May Evening": 50  →  student needs ≥50 min to earn +5 SP; <50 & >0 = 0 SP; absent = -5 SP
export const SESSION_THRESHOLDS_MINUTES = {
  '17 May Evening': 50
};

export const SESSION_THRESHOLDS_PCT = 0.75; // default % of session duration to qualify
