import 'dotenv/config';

export const PORT = Number(process.env.PORT || 5290);
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sakshi_spurti';
export const ALLOW_STUDENT_SEARCH = process.env.ALLOW_STUDENT_SEARCH !== 'false';
// Samagama validates the student's chatengine_token cookie. Spurti reads that
// cookie and confirms the session against this internal endpoint (same host).
export const SAMAGAMA_AUTH_URL = process.env.SAMAGAMA_AUTH_URL || 'http://127.0.0.1:5001/api/auth/me';
