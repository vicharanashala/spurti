import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import Instructor from '../models/Instructor.js';

const router = express.Router();
const JWT_SECRET = process.env.SPURTI_AUTH_SECRET || process.env.JWT_SECRET || 'spurti-secret-key-2026';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/instructor/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const instructor = await Instructor.findOne({ email: normalizedEmail });

    if (!instructor) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, instructor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      id: instructor._id,
      email: instructor.email,
      role: 'instructor',
      cohortId: instructor.cohortId
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    instructor.lastLoginAt = new Date();
    await instructor.save();

    return res.status(200).json({
      token,
      instructor: {
        id: instructor._id,
        name: instructor.name,
        email: instructor.email,
        cohortId: instructor.cohortId
      },
      role: 'instructor'
    });
  } catch (err) {
    console.error('Instructor login error:', err?.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
