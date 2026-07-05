import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import Papa from 'papaparse';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import Cohort from '../models/Cohort.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import FlexibleDayRequest from '../models/FlexibleDayRequest.js';
import { deductSpForApproval } from '../services/flexibleDayService.js';
import { requireInstructor } from '../middleware/requireInstructor.js';

const router = express.Router();
router.use(requireInstructor);

// Multer setup for CSV uploads (in-memory storage, 5 MB max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function isCsvFile(file) {
  if (!file) return false;
  const mimeTypes = ['text/csv', 'text/comma-separated-values', 'application/csv'];
  const ext = file.originalname ? file.originalname.toLowerCase().split('.').pop() : '';
  return mimeTypes.includes(file.mimetype) || ext === 'csv';
}

/**
 * Extracts and normalises the student email from a CSV row.
 * Zoom attendance CSVs use "Email"; poll CSVs use "User Email".
 * Strips surrounding quotes produced by some CSV exporters.
 */
function extractEmail(row) {
  const raw = row['User Email'] || row.Email || row.email || row.EmailAddress || '';
  return String(raw).replace(/^["']|["']$/g, '').trim().toLowerCase();
}

async function getCohortQuery(cohortId, collection = Student) {
  if (cohortId) {
    try {
      const cId = new mongoose.Types.ObjectId(cohortId);
      const count = await collection.countDocuments({ cohortId: cId });
      if (count > 0) return { cohortId: cId };
    } catch { }
  }
  return {};
}

// GET /api/instructor/overview
router.get('/overview', async (req, res) => {
  try {
    const studentFilter = await getCohortQuery(req.instructor?.cohortId, Student);
    const sessionFilter = await getCohortQuery(req.instructor?.cohortId, Session);

    const totalStudents = await Student.countDocuments(studentFilter);
    const activeStudents = await Student.countDocuments({ ...studentFilter, status: 'active' });

    const spAgg = await Student.aggregate([
      { $match: studentFilter },
      { $group: { _id: null, avgSp: { $avg: '$totalSp' } } }
    ]);
    const averageSp = spAgg.length && spAgg[0].avgSp != null ? Math.round(spAgg[0].avgSp * 10) / 10 : 0;

    const totalSessions = await Session.countDocuments(sessionFilter);

    const cohortStudents = await Student.find(studentFilter).select('_id');
    const studentIds = cohortStudents.map(s => s._id);

    const attMatch = studentIds.length > 0 ? { studentId: { $in: studentIds } } : {};
    const attStats = await AttendanceRecord.aggregate([
      { $match: attMatch },
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
      ...(studentIds.length > 0 ? { studentId: { $in: studentIds } } : {}),
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
    const studentQuery = await getCohortQuery(req.instructor?.cohortId, Student);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sortOption = req.query.sort || 'sp_desc';
    const filterOption = req.query.filter || 'all';

    const baseFilter = { ...studentQuery };
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

    const student = await Student.findById(studentId).lean();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
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
    const sessionQuery = await getCohortQuery(req.instructor?.cohortId, Session);
    const studentQuery = await getCohortQuery(req.instructor?.cohortId, Student);
    const sessions = await Session.find(sessionQuery).sort({ date: -1 }).lean();

    const cohortStudentsCount = await Student.countDocuments(studentQuery);

    const enrichedSessions = await Promise.all(sessions.map(async s => {
      const records = await AttendanceRecord.find({ sessionLabel: s.label }).select('qualified');
      const qualifiedCount = records.filter(r => r.qualified).length;
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

// POST /api/instructor/upload/attendance
router.post('/upload/attendance', upload.single('file'), async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const file = req.file;

    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Valid sessionId is required' });
    }

    if (!file || !isCsvFile(file)) {
      return res.status(400).json({ error: 'Please upload a valid CSV file' });
    }

    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const session = await Session.findOne({ _id: sessionId, cohortId });

    if (!session) {
      return res.status(404).json({ error: 'Session not found or does not belong to your cohort' });
    }

    const csvText = file.buffer.toString('utf8');
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim()
    });

    if (parsed.errors && parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
      const firstErr = parsed.errors.find(e => e.type !== 'Delimiter');
      return res.status(400).json({ error: `Failed to parse CSV: ${firstErr?.message || 'unknown error'}` });
    }

    const rows = parsed.data || [];
    let inserted = 0;
    let skipped = 0;
    let notFound = 0;
    const skippedEmailSet = new Set();
    // Start with row-level parse errors; missing-email errors are pushed into this array below
    const errors = [
      ...(parsed.errors || [])
        .filter(e => e.type !== 'Delimiter')
        .map(e => `Parse error at row ${(e.row ?? 0) + 1}: ${e.message}`)
    ];

    // Only load students whose emails appear in the CSV (avoids a full cohort scan)
    const csvEmailsAtt = new Set(rows.map(r => extractEmail(r)).filter(Boolean));
    const students = csvEmailsAtt.size > 0
      ? await Student.find({
          cohortId,
          $or: [
            { email: { $in: [...csvEmailsAtt] } },
            { alternateEmail: { $in: [...csvEmailsAtt] } }
          ]
        }).lean()
      : [];
    const studentMap = new Map();
    for (const student of students) {
      if (student.email) studentMap.set(student.email.toLowerCase(), student);
      if (student.alternateEmail) studentMap.set(student.alternateEmail.toLowerCase(), student);
    }

    const existingRecords = await AttendanceRecord.find({ sessionLabel: session.label }).select('studentId email').lean();
    const existingStudentIds = new Set(existingRecords.map(r => String(r.studentId)));

    const bulkOps = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = extractEmail(row);

      if (!email) {
        errors.push(`Row ${i + 1}: Missing email`);
        continue;
      }

      const student = studentMap.get(email);
      if (!student) {
        notFound++;
        skippedEmailSet.add(email);
        continue;
      }

      if (existingStudentIds.has(String(student._id))) {
        skipped++;
        continue;
      }

      const rawDuration = row['Duration (Minutes)'] || row.Duration || row.duration || '0';
      const attendedMinutes = parseInt(rawDuration, 10) || 0;
      const totalSessionMinutes = session.totalMinutes || 1;
      const attendancePercentage = Math.round((attendedMinutes / totalSessionMinutes) * 100 * 10) / 10;
      const qualified = attendancePercentage >= 75;

      bulkOps.push({
        insertOne: {
          document: {
            email: email || student.email,
            studentId: student._id,
            sessionLabel: session.label,
            attendedMinutes,
            totalSessionMinutes,
            attendancePercentage,
            qualified,
            transactionId: null
          }
        }
      });
      existingStudentIds.add(String(student._id));
      inserted++;
    }

    if (bulkOps.length > 0) {
      await AttendanceRecord.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      sessionLabel: session.label,
      totalRows: rows.length,
      inserted,
      skipped,
      notFound,
      skippedEmails: [...skippedEmailSet],
      errors
    });
  } catch (err) {
    console.error('Attendance upload error:', err?.message);
    return res.status(500).json({ error: 'Failed to process attendance upload' });
  }
});

// POST /api/instructor/upload/poll
router.post('/upload/poll', upload.single('file'), async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const file = req.file;

    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Valid sessionId is required' });
    }

    if (!file || !isCsvFile(file)) {
      return res.status(400).json({ error: 'Please upload a valid CSV file' });
    }

    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const session = await Session.findOne({ _id: sessionId, cohortId });

    if (!session) {
      return res.status(404).json({ error: 'Session not found or does not belong to your cohort' });
    }

    const csvText = file.buffer.toString('utf8');
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim()
    });

    if (parsed.errors && parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
      const firstErr = parsed.errors.find(e => e.type !== 'Delimiter');
      return res.status(400).json({ error: `Failed to parse CSV: ${firstErr?.message || 'unknown error'}` });
    }

    const rows = parsed.data || [];
    const metaHeaders = parsed.meta && parsed.meta.fields ? parsed.meta.fields : (rows[0] ? Object.keys(rows[0]) : []);

    // Detect question columns dynamically: Any header starting with "Q" followed by number and colon (e.g. Q1: ...)
    const qColumns = metaHeaders.filter(h => /^Q\d+:/i.test(h.trim()));

    let inserted = 0;
    let skipped = 0;
    let notFound = 0;
    const skippedEmailSet = new Set();
    // Start with row-level parse errors; missing-email errors are pushed into this array below
    const errors = [
      ...(parsed.errors || [])
        .filter(e => e.type !== 'Delimiter')
        .map(e => `Parse error at row ${(e.row ?? 0) + 1}: ${e.message}`)
    ];

    // Only load students whose emails appear in the CSV (avoids a full cohort scan)
    const csvEmailsPoll = new Set(rows.map(r => extractEmail(r)).filter(Boolean));
    const students = csvEmailsPoll.size > 0
      ? await Student.find({
          cohortId,
          $or: [
            { email: { $in: [...csvEmailsPoll] } },
            { alternateEmail: { $in: [...csvEmailsPoll] } }
          ]
        }).lean()
      : [];
    const studentMap = new Map();
    for (const student of students) {
      if (student.email) studentMap.set(student.email.toLowerCase(), student);
      if (student.alternateEmail) studentMap.set(student.alternateEmail.toLowerCase(), student);
    }

    const existingRecords = await PollRecord.find({ sessionLabel: session.label }).select('studentId').lean();
    const existingStudentIds = new Set(existingRecords.map(r => String(r.studentId)));

    const bulkOps = [];
    const now = new Date();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = extractEmail(row);

      if (!email) {
        errors.push(`Row ${i + 1}: Missing email`);
        continue;
      }

      const student = studentMap.get(email);
      if (!student) {
        notFound++;
        skippedEmailSet.add(email);
        continue;
      }

      if (existingStudentIds.has(String(student._id))) {
        skipped++;
        continue;
      }

      const responses = qColumns.map(qCol => {
        const answer = row[qCol] != null ? String(row[qCol]).trim() : '';
        return {
          question: qCol.trim(),
          answer
        };
      });

      const totalQuestions = qColumns.length;
      const answeredCount = responses.filter(r => r.answer.length > 0).length;
      const participatedFully = totalQuestions > 0 && answeredCount === totalQuestions;

      bulkOps.push({
        insertOne: {
          document: {
            email: email || student.email,
            studentId: student._id,
            sessionLabel: session.label,
            responses,
            totalQuestions,
            answeredCount,
            participatedFully,
            // Note: mongoose timestamps:true does not apply to bulkWrite; set createdAt explicitly
            createdAt: now
          }
        }
      });
      existingStudentIds.add(String(student._id));
      inserted++;
    }

    if (bulkOps.length > 0) {
      await PollRecord.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      sessionLabel: session.label,
      totalRows: rows.length,
      inserted,
      skipped,
      notFound,
      skippedEmails: [...skippedEmailSet],
      errors
    });
  } catch (err) {
    console.error('Poll upload error:', err?.message);
    return res.status(500).json({ error: 'Failed to process poll upload' });
  }
});

// GET /api/instructor/upload/history
router.get('/upload/history', async (req, res) => {
  try {
    const cohortId = new mongoose.Types.ObjectId(req.instructor.cohortId);
    const sessions = await Session.find({ cohortId }).sort({ date: -1 }).lean();

    // Two aggregations replace N×2 countDocuments: 2 DB round-trips regardless of session count
    const sessionLabels = sessions.map(s => s.label);
    const [attAgg, pollAgg] = await Promise.all([
      AttendanceRecord.aggregate([
        { $match: { sessionLabel: { $in: sessionLabels } } },
        { $group: { _id: '$sessionLabel', count: { $sum: 1 } } }
      ]),
      PollRecord.aggregate([
        { $match: { sessionLabel: { $in: sessionLabels } } },
        { $group: { _id: '$sessionLabel', count: { $sum: 1 } } }
      ])
    ]);
    const attCountMap = new Map(attAgg.map(a => [a._id, a.count]));
    const pollCountMap = new Map(pollAgg.map(a => [a._id, a.count]));
    const historyList = sessions.map(session => {
      const attendanceCount = attCountMap.get(session.label) || 0;
      const pollCount = pollCountMap.get(session.label) || 0;
      return {
        sessionId: session._id,
        sessionLabel: session.label,
        date: session.date,
        attendanceUploaded: attendanceCount > 0,
        attendanceCount,
        pollUploaded: pollCount > 0,
        pollCount
      };
    });

    return res.status(200).json(historyList);
  } catch (err) {
    console.error('Fetch upload history error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch upload history' });
  }
});

// GET /api/instructor/at-risk
router.get('/at-risk', async (req, res) => {
  try {
    const students = await Student.find({}).lean();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const txAgg = await SPTransaction.aggregate([
      { $sort: { dateTime: -1 } },
      {
        $group: {
          _id: '$email',
          lastTxDate: { $first: '$dateTime' }
        }
      }
    ]);
    const txMap = new Map();
    for (const item of txAgg) {
      if (item._id) txMap.set(String(item._id).toLowerCase(), item.lastTxDate);
    }

    const now = Date.now();
    const atRiskStudents = [];
    for (const student of students) {
      const emailKey = student.email ? student.email.toLowerCase() : '';
      const lastTx = txMap.get(emailKey);
      if (!lastTx || new Date(lastTx) < sevenDaysAgo) {
        const days = lastTx
          ? Math.floor((now - new Date(lastTx).getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        atRiskStudents.push({
          _id: student._id,
          name: student.name,
          email: student.email,
          totalSp: student.totalSp || 0,
          daysSinceLastTransaction: days
        });
      }
    }

    atRiskStudents.sort((a, b) => b.daysSinceLastTransaction - a.daysSinceLastTransaction);

    return res.json({
      count: atRiskStudents.length,
      students: atRiskStudents.slice(0, 50)
    });
  } catch (err) {
    console.error('At-risk fetch error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch at-risk students' });
  }
});

// GET /api/instructor/sp/transactions
router.get('/sp/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const category = req.query.category ? String(req.query.category).trim() : '';

    const matchQuery = {};
    if (category === 'awards') {
      matchQuery.appliedDelta = { $gt: 0 };
    } else if (category === 'deductions') {
      matchQuery.appliedDelta = { $lt: 0 };
    }

    const total = await SPTransaction.countDocuments(matchQuery);
    const pages = Math.ceil(total / limit) || 1;

    const rawTransactions = await SPTransaction.find(matchQuery)
      .sort({ dateTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('studentId', 'name email')
      .lean();

    const emailList = rawTransactions.map(t => t.email).filter(Boolean);
    const studentList = emailList.length > 0 ? await Student.find({ email: { $in: emailList } }).select('name email').lean() : [];
    const studentEmailMap = new Map(studentList.map(s => [s.email.toLowerCase(), s.name]));

    const transactions = rawTransactions.map(tx => ({
      _id: tx._id,
      studentId: tx.studentId?._id || tx.studentId,
      studentName: tx.studentId?.name || studentEmailMap.get(tx.email?.toLowerCase()) || tx.email || 'Student',
      studentEmail: tx.studentId?.email || tx.email || '',
      category: tx.category || (tx.appliedDelta >= 0 ? 'award' : 'deduction'),
      appliedDelta: tx.appliedDelta,
      balanceAfter: tx.balanceAfter,
      reason: tx.reason || 'Spurti transaction',
      dateTime: tx.dateTime || tx.createdAt
    }));

    return res.status(200).json({
      transactions,
      total,
      page,
      pages
    });
  } catch (err) {
    console.error('SP transactions log error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch transactions log' });
  }
});

// POST /api/instructor/sp/award
router.post('/sp/award', async (req, res) => {
  try {
    const { targetType, studentId, amount, reason } = req.body || {};
    const parsedAmount = Math.abs(parseInt(amount, 10)) || 0;

    if (!parsedAmount || parsedAmount < 1 || parsedAmount > 500) {
      return res.status(400).json({ error: 'Amount must be between 1 and 500' });
    }
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'Reason must be at least 10 characters' });
    }

    let studentsToReward = [];
    if (targetType === 'single') {
      if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ error: 'Valid studentId is required' });
      }
      const st = await Student.findById(studentId);
      if (!st) return res.status(404).json({ error: 'Student not found' });
      studentsToReward = [st];
    } else {
      const studentQuery = await getCohortQuery(req.instructor?.cohortId, Student);
      studentsToReward = await Student.find(studentQuery);
    }

    const now = new Date();
    for (const student of studentsToReward) {
      student.totalSp = (student.totalSp || 0) + parsedAmount;
      await student.save();

      await SPTransaction.create({
        email: student.email,
        studentId: student._id,
        category: 'award',
        deltaMode: 'absolute',
        deltaValue: parsedAmount,
        appliedDelta: parsedAmount,
        balanceAfter: student.totalSp,
        reason: String(reason).trim(),
        dateTime: now
      });
    }

    return res.json({ success: true, count: studentsToReward.length });
  } catch (err) {
    console.error('Award SP error:', err?.message);
    return res.status(500).json({ error: 'Failed to award SP' });
  }
});

// POST /api/instructor/sp/deduct
router.post('/sp/deduct', async (req, res) => {
  try {
    const { targetType, studentId, amount, reason } = req.body || {};
    const parsedAmount = Math.abs(parseInt(amount, 10)) || 0;

    if (!parsedAmount || parsedAmount < 1 || parsedAmount > 500) {
      return res.status(400).json({ error: 'Amount must be between 1 and 500' });
    }
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'Reason must be at least 10 characters' });
    }

    let studentsToDeduct = [];
    if (targetType === 'single') {
      if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ error: 'Valid studentId is required' });
      }
      const st = await Student.findById(studentId);
      if (!st) return res.status(404).json({ error: 'Student not found' });
      studentsToDeduct = [st];
    } else {
      const studentQuery = await getCohortQuery(req.instructor?.cohortId, Student);
      studentsToDeduct = await Student.find(studentQuery);
    }

    const now = new Date();
    for (const student of studentsToDeduct) {
      student.totalSp = Math.max(0, (student.totalSp || 0) - parsedAmount);
      await student.save();

      await SPTransaction.create({
        email: student.email,
        studentId: student._id,
        category: 'deduction',
        deltaMode: 'absolute',
        deltaValue: -parsedAmount,
        appliedDelta: -parsedAmount,
        balanceAfter: student.totalSp,
        reason: String(reason).trim(),
        dateTime: now
      });
    }

    return res.json({ success: true, count: studentsToDeduct.length });
  } catch (err) {
    console.error('Deduct SP error:', err?.message);
    return res.status(500).json({ error: 'Failed to deduct SP' });
  }
});

// GET /api/instructor/flexible-day/pending
router.get('/flexible-day/pending', async (req, res) => {
  try {
    const pendingRequests = await FlexibleDayRequest.find({ status: 'PENDING' })
      .sort({ requestedAt: 1 })
      .populate('studentId', 'name email totalSp')
      .lean();

    const result = pendingRequests.map(r => {
      const reqAtMs = new Date(r.requestedAt).getTime();
      const expiresAt = new Date(reqAtMs + 24 * 60 * 60 * 1000).toISOString();
      return {
        requestId: r._id,
        studentId: r.studentId?._id || r.studentId,
        studentName: r.studentId?.name || 'Student',
        studentEmail: r.studentId?.email || '',
        studentTotalSp: r.studentId?.totalSp || 0,
        sessionLabel: r.sessionLabel,
        sessionDate: r.sessionDate,
        requestedAt: r.requestedAt,
        expiresAt,
        disclaimerAccepted: r.disclaimerAccepted
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Fetch pending flexible day requests error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch pending flexible day requests' });
  }
});

// PUT /api/instructor/flexible-day/:requestId/approve
router.put('/flexible-day/:requestId/approve', async (req, res) => {
  try {
    const { requestId } = req.params;
    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: 'Valid requestId is required' });
    }

    const requestDoc = await FlexibleDayRequest.findById(requestId);
    if (!requestDoc) {
      return res.status(404).json({ error: 'Flexible day request not found' });
    }

    if (requestDoc.status !== 'PENDING') {
      return res.status(400).json({ error: `Request cannot be approved (current status: ${requestDoc.status})` });
    }

    const student = await Student.findById(requestDoc.studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student associated with request not found' });
    }

    if ((student.totalSp || 0) < 140) {
      return res.status(400).json({ error: `Student has insufficient SP (${student.totalSp} SP < 140 SP requirement)` });
    }

    const result = await deductSpForApproval(student._id, requestDoc._id, requestDoc.sessionLabel);

    // Create notification for student
    try {
      const notificationsCollection = mongoose.connection.collection('notifications');
      await notificationsCollection.insertOne({
        recipientId: student._id,
        type: 'FLEXIBLE_DAY_APPROVED',
        payload: {
          sessionLabel: requestDoc.sessionLabel,
          sessionDate: requestDoc.sessionDate,
          spDeducted: 140
        },
        createdAt: new Date()
      });
    } catch {
      // Best-effort notification
    }

    const updatedRequest = await FlexibleDayRequest.findById(requestId);
    return res.json(updatedRequest);
  } catch (err) {
    console.error('Approve flexible day request error:', err?.message);
    return res.status(500).json({ error: err?.message || 'Failed to approve request' });
  }
});

// PUT /api/instructor/flexible-day/:requestId/reject
router.put('/flexible-day/:requestId/reject', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { note } = req.body || {};

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: 'Valid requestId is required' });
    }

    const requestDoc = await FlexibleDayRequest.findById(requestId);
    if (!requestDoc) {
      return res.status(404).json({ error: 'Flexible day request not found' });
    }

    if (requestDoc.status !== 'PENDING') {
      return res.status(400).json({ error: `Request cannot be rejected (current status: ${requestDoc.status})` });
    }

    const now = new Date();
    requestDoc.status = 'REJECTED';
    requestDoc.respondedAt = now;
    if (note && typeof note === 'string') {
      requestDoc.instructorNote = note.trim();
    }
    await requestDoc.save();

    // Create notification for student
    try {
      const notificationsCollection = mongoose.connection.collection('notifications');
      await notificationsCollection.insertOne({
        recipientId: requestDoc.studentId,
        type: 'FLEXIBLE_DAY_REJECTED',
        payload: {
          sessionLabel: requestDoc.sessionLabel,
          reason: note || 'No reason provided'
        },
        createdAt: now
      });
    } catch {
      // Best-effort notification
    }

    return res.json(requestDoc);
  } catch (err) {
    console.error('Reject flexible day request error:', err?.message);
    return res.status(500).json({ error: err?.message || 'Failed to reject request' });
  }
});

// GET /api/instructor/flexible-day/history
router.get('/flexible-day/history', async (req, res) => {
  try {
    const historyRequests = await FlexibleDayRequest.find({ status: { $ne: 'PENDING' } })
      .sort({ respondedAt: -1, updatedAt: -1 })
      .populate('studentId', 'name email totalSp')
      .lean();

    const result = historyRequests.map(r => {
      return {
        requestId: r._id,
        studentId: r.studentId?._id || r.studentId,
        studentName: r.studentId?.name || 'Student',
        studentEmail: r.studentId?.email || '',
        studentTotalSp: r.studentId?.totalSp || 0,
        sessionLabel: r.sessionLabel,
        sessionDate: r.sessionDate,
        requestedAt: r.requestedAt,
        respondedAt: r.respondedAt || r.autoExpiredAt || r.updatedAt,
        status: r.status,
        instructorNote: r.instructorNote,
        spDeducted: r.spDeducted
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Fetch flexible day history error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch flexible day history' });
  }
});

export default router;
