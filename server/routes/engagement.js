import { Router } from 'express';
import { fetchStudentEngagementData } from '../engagement/fetchData.js';
import { classifyBand } from '../engagement/classifyBand.js';
import Student from '../models/Student.js';

const router = Router();

router.get('/engagement/:email', async (req, res) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const student = await Student.findOne({ email }).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const data = await fetchStudentEngagementData(email);
    const result = classifyBand(data.current, data.previous);

    res.json({
      email,
      name: student.name,
      totalSp: student.totalSp,
      band: result.band,
      reason: result.reason,
      stats: result.stats,
      windows: {
        windowSize: data.current.length,
        current: data.current.map(s => ({
          label: s.label,
          attendancePct: s.attendancePct,
          spDelta: s.spDelta
        })),
        previous: data.previous.length > 0 ? data.previous.map(s => ({
          label: s.label,
          attendancePct: s.attendancePct,
          spDelta: s.spDelta
        })) : null
      }
    });
  } catch (err) {
    console.error('Engagement API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
