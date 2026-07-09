import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');

const spamReportsPath = path.join(dataDir, 'spam_reports.json');
const duplicatesPath = path.join(dataDir, 'duplicates.json');
const moderationLogsPath = path.join(dataDir, 'moderation_logs.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
      return defaultVal;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || JSON.stringify(defaultVal));
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultVal;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

export function getSpamReports() {
  return readJson(spamReportsPath);
}

export function saveSpamReport(report) {
  const reports = getSpamReports();
  reports.unshift(report); // newer first
  writeJson(spamReportsPath, reports);
}

export function updateSpamReportStatus(reportId, status) {
  const reports = getSpamReports();
  const index = reports.findIndex(r => r.id === reportId);
  if (index !== -1) {
    reports[index].status = status;
    reports[index].updatedAt = new Date().toISOString();
    writeJson(spamReportsPath, reports);
    return reports[index];
  }
  return null;
}

export function getDuplicates() {
  return readJson(duplicatesPath);
}

export function saveDuplicate(dup) {
  const dups = getDuplicates();
  // Avoid duplicate entries for the same question
  const filtered = dups.filter(d => d.questionId !== dup.questionId);
  filtered.push(dup);
  writeJson(duplicatesPath, filtered);
}

export function removeDuplicate(questionId) {
  const dups = getDuplicates();
  const filtered = dups.filter(d => d.questionId !== questionId);
  writeJson(duplicatesPath, filtered);
}

export function getModerationLogs() {
  return readJson(moderationLogsPath);
}

export function logModerationAction(action, adminEmail, targetId, targetType, details) {
  const logs = getModerationLogs();
  const newLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    action,
    adminEmail,
    targetId,
    targetType,
    details,
    timestamp: new Date().toISOString()
  };
  logs.unshift(newLog); // newer first
  writeJson(moderationLogsPath, logs);
  return newLog;
}

export function removeSpamReportsForQuestion(questionId) {
  const reports = getSpamReports();
  const filtered = reports.filter(r => r.postId !== questionId && r.questionId !== questionId);
  writeJson(spamReportsPath, filtered);
}

export function removeSpamReportsForAnswer(answerId) {
  const reports = getSpamReports();
  const filtered = reports.filter(r => r.postId !== answerId);
  writeJson(spamReportsPath, filtered);
}
