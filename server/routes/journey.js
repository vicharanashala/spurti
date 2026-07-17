import { Router } from 'express';
import { computeJourney } from '../journey/computeJourney.js';
import Student from '../models/Student.js';

const router = Router();

router.get('/journey/:email', async (req, res) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    const window = ['weekly', 'monthly', 'tenure'].includes(req.query.window)
      ? req.query.window : 'weekly';
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const student = await Student.findOne({ email }).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const result = await computeJourney(email, student, window);
    if (!result) return res.status(400).json({ error: 'Invalid window' });
    res.json(result);
  } catch (err) {
    console.error('Journey API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
