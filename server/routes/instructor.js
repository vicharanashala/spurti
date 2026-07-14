import express from 'express';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import Cohort from '../models/Cohort.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import { requireInstructor } from '../middleware/requireInstructor.js';

const router = express.Router();
router.use(requireInstructor);

// GET /api/instructor/overview
router.get('/overview', async (req, res) => {
  try {
    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);

    const totalStudents = await Student.countDocuments({ cohortId });
    const activeStudents = await Student.countDocuments({ cohortId, status: 'active' });

    const spAgg = await Student.aggregate([
      { $match: { cohortId } },
      { $group: { _id: null, avgSp: { $avg: '$totalSp' } } }
    ]);
    const averageSp = spAgg.length && spAgg[0].avgSp != null ? Math.round(spAgg[0].avgSp * 10) / 10 : 0;

    const totalSessions = await Session.countDocuments({ cohortId });

    const cohortStudents = await Student.find({ cohortId }).select('_id');
    const studentIds = cohortStudents.map(s => s._id);

    const attStats = await AttendanceRecord.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          qualifiedCount: { $sum: { $cond: ['$qualified', 1, 0] } }
        }
      }
    ]);
    const averageAttendanceRate = attStats.length && attStats[0].total > 0
      ? Math.round((attStats[0].qualifiedCount / attStats[0].total) * 1000) / 10
      : 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeStudentTxIds = await SPTransaction.distinct('studentId', {
      studentId: { $in: studentIds },
      dateTime: { $gte: sevenDaysAgo }
    });
    const activeTxSet = new Set(activeStudentTxIds.map(id => String(id)));
    const atRiskCount = studentIds.filter(id => !activeTxSet.has(String(id))).length;

    return res.status(200).json({
      totalStudents,
      activeStudents,
      averageSp,
      totalSessions,
      averageAttendanceRate,
      atRiskCount
    });
  } catch (err) {
    console.error('Instructor overview error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch overview data' });
  }
});

// GET /api/instructor/students
router.get('/students', async (req, res) => {
  try {
    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sortOption = req.query.sort || 'sp_desc';
    const filterOption = req.query.filter || 'all';

    const baseFilter = { cohortId };
    if (search) {
      baseFilter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    if (filterOption === 'excused') {
      baseFilter.status = 'excused';
    }

    const allMatchedStudents = await Student.find(baseFilter).lean();

    const studentIds = allMatchedStudents.map(s => s._id);

    // Fetch attendance stats per student
    const attMap = new Map();
    const attAgg = await AttendanceRecord.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: '$studentId',
          total: { $sum: 1 },
          qualified: { $sum: { $cond: ['$qualified', 1, 0] } }
        }
      }
    ]);
    for (const item of attAgg) {
      const rate = item.total > 0 ? Math.round((item.qualified / item.total) * 1000) / 10 : 0;
      attMap.set(String(item._id), rate);
    }

    // Fetch latest transaction per student
    const txMap = new Map();
    const txAgg = await SPTransaction.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      { $sort: { dateTime: -1 } },
      {
        $group: {
          _id: '$studentId',
          lastTxDate: { $first: '$dateTime' }
        }
      }
    ]);
    for (const item of txAgg) {
      txMap.set(String(item._id), item.lastTxDate);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let processedStudents = allMatchedStudents.map(s => {
      const sId = String(s._id);
      const lastTx = txMap.get(sId) || null;
      const isAtRisk = !lastTx || new Date(lastTx) < sevenDaysAgo;
      const attendanceRate = attMap.get(sId) || 0;

      return {
        _id: s._id,
        name: s.name,
        email: s.email,
        totalSp: s.totalSp || 0,
        attendanceRate,
        lastTransactionAt: lastTx,
        status: s.status,
        cohortId: s.cohortId,
        isAtRisk
      };
    });

    if (filterOption === 'at_risk') {
      processedStudents = processedStudents.filter(s => s.isAtRisk);
    }

    // Sorting
    processedStudents.sort((a, b) => {
      if (sortOption === 'sp_desc') return b.totalSp - a.totalSp;
      if (sortOption === 'sp_asc') return a.totalSp - b.totalSp;
      if (sortOption === 'name_asc') return a.name.localeCompare(b.name);
      if (sortOption === 'attendance_desc') return b.attendanceRate - a.attendanceRate;
      return b.totalSp - a.totalSp;
    });

    const total = processedStudents.length;
    const pages = Math.ceil(total / limit) || 1;
    const paginatedStudents = processedStudents.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      students: paginatedStudents,
      total,
      page,
      pages
    });
  } catch (err) {
    console.error('Fetch instructor students error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/instructor/students/:studentId
router.get('/students/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await Student.findOne({
      _id: studentId,
      cohortId: req.instructor.cohortId
    }).lean();

    if (!student) {
      return res.status(404).json({ error: 'Student not found in your cohort' });
    }

    const recentTransactions = await SPTransaction.find({ studentId })
      .sort({ dateTime: -1 })
      .limit(10)
      .lean();

    const attendanceRecords = await AttendanceRecord.find({ studentId }).lean();
    const totalSessions = attendanceRecords.length;
    const attended = attendanceRecords.filter(r => r.qualified).length;
    const attendanceRate = totalSessions > 0 ? Math.round((attended / totalSessions) * 1000) / 10 : 0;

    const sessionBreakdown = attendanceRecords.map(r => ({
      label: r.sessionLabel,
      qualified: r.qualified,
      attendancePercentage: r.attendancePercentage
    }));

    return res.status(200).json({
      student,
      recentTransactions,
      attendanceSummary: {
        totalSessions,
        attended,
        attendanceRate,
        sessionBreakdown
      }
    });
  } catch (err) {
    console.error('Fetch student detail error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch student details' });
  }
});

// GET /api/instructor/sessions
router.get('/sessions', async (req, res) => {
  try {
    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const sessions = await Session.find({ cohortId }).sort({ date: -1 }).lean();

    const cohortStudents = await Student.find({ cohortId }).select('_id').lean();
    const cohortStudentIds = cohortStudents.map(s => s._id);
    const cohortStudentsCount = cohortStudentIds.length;

    const enrichedSessions = await Promise.all(sessions.map(async s => {
      const qualifiedCount = await AttendanceRecord.countDocuments({
        sessionLabel: s.label,
        studentId: { $in: cohortStudentIds },
        qualified: true
      });
      const attendanceRate = cohortStudentsCount > 0
        ? Math.round((qualifiedCount / cohortStudentsCount) * 1000) / 10
        : 0;

      return {
        _id: s._id,
        label: s.label,
        date: s.date,
        type: s.type,
        totalMinutes: s.totalMinutes,
        attendanceRate,
        qualifiedCount,
        totalStudents: cohortStudentsCount
      };
    }));

    return res.status(200).json(enrichedSessions);
  } catch (err) {
    console.error('Fetch instructor sessions error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/instructor/at-risk
router.get('/at-risk', async (req, res) => {
  try {
    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const students = await Student.find({ cohortId }).lean();
    const studentIds = students.map(s => s._id);

    const txAgg = await SPTransaction.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      { $sort: { dateTime: -1 } },
      {
        $group: {
          _id: '$studentId',
          lastTxDate: { $first: '$dateTime' }
        }
      }
    ]);

    const txMap = new Map();
    for (const item of txAgg) {
      txMap.set(String(item._id), item.lastTxDate);
    }

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const atRiskList = [];

    for (const s of students) {
      const sId = String(s._id);
      const lastTx = txMap.get(sId);
      if (!lastTx || (now - new Date(lastTx).getTime()) > sevenDaysMs) {
        const daysSince = lastTx
          ? Math.floor((now - new Date(lastTx).getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        atRiskList.push({
          _id: s._id,
          name: s.name,
          email: s.email,
          totalSp: s.totalSp || 0,
          daysSinceLastTransaction: daysSince
        });
      }
    }

    atRiskList.sort((a, b) => b.daysSinceLastTransaction - a.daysSinceLastTransaction);

    return res.status(200).json({
      count: atRiskList.length,
      students: atRiskList
    });
  } catch (err) {
    console.error('Fetch at-risk students error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch at-risk students' });
  }
});

// POST /api/instructor/sp/award
router.post('/sp/award', async (req, res) => {
  try {
    const { targetType, studentId, amount, reason } = req.body || {};

    if (!targetType || !['single', 'cohort'].includes(targetType)) {
      return res.status(400).json({ error: "targetType must be 'single' or 'cohort'" });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 1 || numAmount > 500) {
      return res.status(400).json({ error: 'Amount must be between 1 and 500' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return res.status(400).json({ error: 'Reason must be at least 10 characters long' });
    }

    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const now = new Date();

    if (targetType === 'single') {
      if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ error: 'Valid studentId is required for single award' });
      }

      const student = await Student.findOne({ _id: studentId, cohortId });
      if (!student) {
        return res.status(404).json({ error: 'Student not found in your cohort' });
      }

      student.totalSp += numAmount;
      await student.save();

      await SPTransaction.create({
        email: student.email,
        studentId: student._id,
        category: 'manual_award',
        deltaMode: 'relative',
        deltaValue: numAmount,
        appliedDelta: numAmount,
        balanceAfter: student.totalSp,
        reason: reason.trim(),
        dateTime: now
      });

      return res.status(200).json({ success: true, count: 1 });
    } else {
      // Cohort wide award
      const activeStudents = await Student.find({ cohortId, status: 'active' });
      if (activeStudents.length === 0) {
        return res.status(200).json({ success: true, count: 0 });
      }

      const txDocs = [];
      const studentBulkOps = [];

      for (const student of activeStudents) {
        const newBalance = (student.totalSp || 0) + numAmount;
        studentBulkOps.push({
          updateOne: {
            filter: { _id: student._id },
            update: { $inc: { totalSp: numAmount } }
          }
        });
        txDocs.push({
          email: student.email,
          studentId: student._id,
          category: 'manual_award',
          deltaMode: 'relative',
          deltaValue: numAmount,
          appliedDelta: numAmount,
          balanceAfter: newBalance,
          reason: reason.trim(),
          dateTime: now
        });
      }

      await Student.bulkWrite(studentBulkOps);
      await SPTransaction.insertMany(txDocs);

      return res.status(200).json({ success: true, count: activeStudents.length });
    }
  } catch (err) {
    console.error('Award SP error:', err?.message);
    return res.status(500).json({ error: 'Failed to award SP' });
  }
});

// POST /api/instructor/sp/deduct
router.post('/sp/deduct', async (req, res) => {
  try {
    const { studentId, amount, reason } = req.body || {};

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Valid studentId is required' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 1 || numAmount > 200) {
      return res.status(400).json({ error: 'Amount must be between 1 and 200' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 20) {
      return res.status(400).json({ error: 'Detailed reason (minimum 20 characters) is required for misconduct deduction' });
    }

    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const student = await Student.findOne({ _id: studentId, cohortId });

    if (!student) {
      return res.status(404).json({ error: 'Student not found in your cohort' });
    }

    const currentBalance = student.totalSp || 0;
    const actualDeducted = Math.min(numAmount, currentBalance);
    const newBalance = Math.max(0, currentBalance - actualDeducted);

    student.totalSp = newBalance;
    await student.save();

    await SPTransaction.create({
      email: student.email,
      studentId: student._id,
      category: 'misconduct_deduction',
      deltaMode: 'relative',
      deltaValue: -numAmount,
      appliedDelta: -actualDeducted,
      balanceAfter: newBalance,
      reason: reason.trim(),
      dateTime: new Date()
    });

    return res.status(200).json({
      success: true,
      updatedBalance: newBalance,
      deducted: actualDeducted
    });
  } catch (err) {
    console.error('Deduct SP error:', err?.message);
    return res.status(500).json({ error: 'Failed to deduct SP' });
  }
});

// GET /api/instructor/sp/transactions
router.get('/sp/transactions', async (req, res) => {
  try {
    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));

    const cohortStudents = await Student.find({ cohortId }).select('_id name email');
    const studentMap = new Map();
    cohortStudents.forEach(s => studentMap.set(String(s._id), s.name));

    const studentIds = cohortStudents.map(s => s._id);

    const queryFilter = { studentId: { $in: studentIds } };

    if (req.query.studentId && mongoose.Types.ObjectId.isValid(req.query.studentId)) {
      queryFilter.studentId = new mongoose.Types.ObjectId(req.query.studentId);
    }
    if (req.query.category) {
      if (req.query.category === 'awards') {
        queryFilter.category = 'manual_award';
      } else if (req.query.category === 'deductions') {
        queryFilter.category = 'misconduct_deduction';
      } else {
        queryFilter.category = req.query.category;
      }
    }
    if (req.query.dateFrom || req.query.dateTo) {
      queryFilter.dateTime = {};
      if (req.query.dateFrom) queryFilter.dateTime.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) queryFilter.dateTime.$lte = new Date(req.query.dateTo);
    }

    const total = await SPTransaction.countDocuments(queryFilter);
    const pages = Math.ceil(total / limit) || 1;

    const rawTransactions = await SPTransaction.find(queryFilter)
      .sort({ dateTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const transactions = rawTransactions.map(tx => ({
      ...tx,
      studentName: studentMap.get(String(tx.studentId)) || tx.email
    }));

    return res.status(200).json({
      transactions,
      total,
      page,
      pages
    });
  } catch (err) {
    console.error('Fetch instructor transactions error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
