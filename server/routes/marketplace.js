import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { SPURTI_AUTH_SECRET } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import MarketplaceRedemption from '../models/MarketplaceRedemption.js';
import { recalculateStudentSp } from '../scripts/lib/ingestion.js';

const router = express.Router();
const STUDENT_COOKIE = 'spurti_student';

// ── Fixed pet catalogue ────────────────────────────────────────────────
export const PETS = [
  {
    id: 'chick',
    emoji: '🐣',
    name: 'Baby Chick',
    character: 'Pip',
    description: 'A tiny, curious chick who peeps with excitement at every new lesson.',
    personality: 'Curious & Cheerful',
    spCost: 75,
  },
  {
    id: 'frog',
    emoji: '🐸',
    name: 'Frog',
    character: 'Ribbit',
    description: 'A chill frog who sits on lily pads and leaps into action when it counts.',
    personality: 'Cool & Reliable',
    spCost: 120,
  },
  {
    id: 'panda',
    emoji: '🐼',
    name: 'Panda',
    character: 'Bamboo',
    description: 'A gentle giant who munches bamboo and quietly masters every subject.',
    personality: 'Calm & Wise',
    spCost: 170,
  },
  {
    id: 'fox',
    emoji: '🦊',
    name: 'Fox',
    character: 'Ember',
    description: 'A sharp-witted fox with a fiery spirit and an eye for clever solutions.',
    personality: 'Sharp & Witty',
    spCost: 220,
  },
  {
    id: 'wolf',
    emoji: '🐺',
    name: 'Wolf',
    character: 'Storm',
    description: 'A lone wolf who howls at milestones and leads the pack in consistency.',
    personality: 'Bold & Determined',
    spCost: 280,
  },
  {
    id: 'lion',
    emoji: '🦁',
    name: 'Lion',
    character: 'Roar',
    description: 'The king of learners — fierce focus, unstoppable momentum.',
    personality: 'Fierce & Focused',
    spCost: 340,
  },
  {
    id: 'unicorn',
    emoji: '🦄',
    name: 'Unicorn',
    character: 'Sparkle',
    description: 'A magical unicorn who sprinkles creativity and wonder on every task.',
    personality: 'Creative & Magical',
    spCost: 420,
  },
  {
    id: 'dragon',
    emoji: '🐉',
    name: 'Dragon',
    character: 'Blaze',
    description: 'The rarest companion — a dragon earned only by the most dedicated learners.',
    personality: 'Legendary & Unstoppable',
    spCost: 500,
  },
];

// ── Auth helpers (mirrors server.js) ──────────────────────────────────
function parseCookies(header = '') {
  return Object.fromEntries(
    String(header).split(';').map(part => {
      const index = part.indexOf('=');
      if (index < 0) return null;
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }).filter(Boolean)
  );
}

function signValue(value) {
  return crypto.createHmac('sha256', SPURTI_AUTH_SECRET).update(value).digest('base64url');
}

function verifySignedToken(token) {
  if (!SPURTI_AUTH_SECRET) return null;
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = signValue(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.email || !payload.exp || Date.now() > Number(payload.exp)) return null;
    return { email: String(payload.email).trim().toLowerCase() };
  } catch {
    return null;
  }
}

function studentFromCookie(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySignedToken(cookies[STUDENT_COOKIE]);
}

async function requireStudent(req, res) {
  const verified = studentFromCookie(req);
  if (!verified) {
    res.status(401).json({ error: 'Not authenticated. Please log in from Samagama or use the search flow.' });
    return null;
  }
  const student = await Student.findOne({ email: verified.email }).lean();
  if (!student) {
    res.status(404).json({ error: 'Student record not found.' });
    return null;
  }
  if (student.status === 'excused') {
    res.status(403).json({ error: 'Your account is excused.' });
    return null;
  }
  return student;
}

// ── GET /marketplace/items ─────────────────────────────────────────────
// Returns the full pet catalogue (public — no auth needed)
router.get('/items', (_req, res) => {
  res.json(PETS);
});

// ── GET /marketplace/my-pets ───────────────────────────────────────────
// Returns all redemptions (pets adopted) for the authenticated student
router.get('/my-pets', async (req, res) => {
  const student = await requireStudent(req, res);
  if (!student) return;
  const redemptions = await MarketplaceRedemption.find({ email: student.email })
    .sort({ createdAt: 1 })
    .lean();
  res.json(redemptions);
});

// ── POST /marketplace/redeem ───────────────────────────────────────────
// Deducts SP and records the adoption
router.post('/redeem', async (req, res) => {
  const student = await requireStudent(req, res);
  if (!student) return;

  const { petId } = req.body || {};
  const pet = PETS.find(p => p.id === petId);
  if (!pet) return res.status(400).json({ error: 'Invalid pet ID.' });

  // Check balance
  if (student.totalSp < pet.spCost) {
    return res.status(400).json({
      error: `Not enough SP. You have ${student.totalSp} SP but ${pet.name} costs ${pet.spCost} SP.`
    });
  }

  // Get current balance from last transaction for accurate running balance
  const lastTxn = await SPTransaction.findOne({ email: student.email })
    .sort({ dateTime: -1, createdAt: -1 })
    .lean();
  const currentBalance = lastTxn ? Number(lastTxn.balanceAfter) : Number(student.totalSp);
  const balanceAfter = currentBalance - pet.spCost;

  // Create SP transaction (debit)
  const transaction = await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'marketplace',
    sessionLabel: '',
    deltaMode: 'absolute',
    deltaValue: -pet.spCost,
    appliedDelta: -pet.spCost,
    balanceAfter,
    reason: `🛍️ Marketplace: Adopted ${pet.emoji} ${pet.name} (${pet.character}) for ${pet.spCost} SP.`,
    dateTime: new Date(),
  });

  // Recalculate student's totalSp
  await recalculateStudentSp(student.email);

  // Record the redemption
  const redemption = await MarketplaceRedemption.create({
    petId: pet.id,
    petName: pet.name,
    petEmoji: pet.emoji,
    spCost: pet.spCost,
    email: student.email,
    studentId: student._id,
    studentName: student.name,
    transactionId: transaction._id,
  });

  // Return updated balance
  const updatedStudent = await Student.findOne({ email: student.email }).lean();

  res.json({
    success: true,
    pet,
    redemption,
    newBalance: updatedStudent.totalSp,
  });
});

export default router;
