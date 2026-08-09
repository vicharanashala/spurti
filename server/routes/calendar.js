import express from 'express';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import { buildICS, encryptToken, decryptToken } from '../utils/calendar.js';

const router = express.Router();

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }

router.get('/ics', async (req, res) => {
  try {
    const sessions = await Session.find({ endDateTime: { $gte: new Date() } }).sort({ startDateTime: 1 }).lean();
    const ics = buildICS(sessions);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="spurti-sessions.ics"');
    res.send(ics);
  } catch (err) {
    console.error('ICS generation failed:', err?.message);
    res.status(500).json({ error: 'failed to generate ics' });
  }
});

// Initiate Google OAuth flow. Accepts optional `email` query to link student.
router.get('/oauth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google client not configured' });
  const email = normalizeEmail(req.query.email || '');
  const redirect = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/calendar/oauth/google/callback`;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar');
  const url = `${GOOGLE_AUTH}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(email)}`;
  res.redirect(url);
});

// OAuth callback: exchange code and store encrypted refresh token for the student
router.get('/oauth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const stateEmail = normalizeEmail(req.query.state || '');
    if (!code) return res.status(400).send('missing code');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/calendar/oauth/google/callback`;
    const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' });
    const tokenRes = await fetch(GOOGLE_TOKEN, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Token exchange failed', tokenJson);
      return res.status(500).json({ error: 'token exchange failed', details: tokenJson });
    }
    const refreshToken = tokenJson.refresh_token;
    const expiresIn = Number(tokenJson.expires_in || 0);
    if (!refreshToken) {
      // Google may not return refresh token if previously granted — indicate this to user
      return res.status(400).send('No refresh token returned. Revoke prior access and try again with prompt=consent.');
    }
    if (!stateEmail) return res.status(400).send('No email state provided to link account');
    const student = await Student.findOne({ $or: [{ email: stateEmail }, { alternateEmail: stateEmail }] });
    if (!student) return res.status(404).send('Student not found');
    const key = process.env.CALENDAR_ENCRYPTION_KEY || '';
    const encrypted = encryptToken(refreshToken, key);
    student.jscalendar = student.jscalendar || {};
    student.jscalendar.google = { refreshToken: encrypted, tokenExpiry: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null };
    await student.save();
    // simple success page
    res.send('Google Calendar linked successfully. You may close this tab.');
  } catch (err) {
    console.error('OAuth callback error:', err?.message);
    res.status(500).send('OAuth callback failed');
  }
});

// Create events in the user's Google Calendar using stored refresh token
router.post('/sync', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.query.email || req.headers['x-student-email'] || '');
    if (!email) return res.status(401).json({ error: 'email required' });
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const stored = student.jscalendar?.google?.refreshToken;
    if (!stored) return res.status(400).json({ error: 'no refresh token stored' });
    const key = process.env.CALENDAR_ENCRYPTION_KEY || '';
    const refreshToken = decryptToken(stored, key);
    if (!refreshToken) return res.status(400).json({ error: 'unable to decrypt refresh token' });

    // Exchange refresh token for access token
    const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: refreshToken, grant_type: 'refresh_token' });
    const tokenRes = await fetch(GOOGLE_TOKEN, { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Refresh token exchange failed', tokenJson);
      return res.status(500).json({ error: 'token refresh failed', details: tokenJson });
    }
    const accessToken = tokenJson.access_token;
    const expiresIn = Number(tokenJson.expires_in || 0);
    const newRefresh = tokenJson.refresh_token;

    // Optionally update stored refresh token if provider returned a new one
    if (newRefresh) {
      const encrypted = encryptToken(newRefresh, key);
      student.jscalendar.google.refreshToken = encrypted;
    }
    if (expiresIn) student.jscalendar.google.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    await student.save();

    // Fetch upcoming sessions and insert events
    const sessions = await Session.find({ endDateTime: { $gte: new Date() } }).sort({ startDateTime: 1 }).lean();
    let created = 0;
    for (const s of sessions) {
      try {
        const event = {
          summary: s.label || 'Spurti Session',
          description: `Spurti session: ${s.label || ''}`,
          start: { dateTime: (s.startDateTime || s.date || s.endDateTime).toISOString() },
          end: { dateTime: (s.endDateTime || s.startDateTime || s.date).toISOString() }
        };
        const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        });
        if (r.ok) created += 1;
        else {
          const txt = await r.text();
          console.warn('Failed to create event', s.label, r.status, txt.slice(0, 400));
        }
      } catch (err) {
        console.error('Event creation error for', s.label, err?.message);
      }
    }
    res.json({ ok: true, created });
  } catch (err) {
    console.error('Sync error:', err?.message);
    res.status(500).json({ error: 'sync failed' });
  }
});

// Disconnect calendar (remove stored refresh token)
router.post('/disconnect', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.query.email || req.headers['x-student-email'] || '');
    if (!email) return res.status(401).json({ error: 'email required' });
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    student.jscalendar = student.jscalendar || {};
    student.jscalendar.google = { refreshToken: '', tokenExpiry: null };
    await student.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Disconnect error:', err?.message);
    res.status(500).json({ error: 'disconnect failed' });
  }
});

export default router;

