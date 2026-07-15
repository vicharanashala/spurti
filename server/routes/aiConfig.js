// Admin endpoints for AI Config and AI-powered question generation.
// Mounted at /api/ai-config/* and /api/contest/admin/ai-generate (the latter
// is exposed via the contest router, not here, to keep question generation
// scoped under the contest feature).

import express from 'express';
import AIConfig from '../models/AIConfig.js';
import { encrypt, decrypt, last4 } from '../services/crypto.js';
import { testConnection } from '../services/aiProvider.js';

const router = express.Router();

function adminGuard(req, res, next) {
  const adminEmail = req.headers['x-admin-email'];
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_TOKEN || 'vled-local-admin';
  if (!adminEmail || adminToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Strip the encrypted key for the admin UI — never send it back over the wire.
function publicShape(doc) {
  if (!doc) return null;
  const envFallbackActive = !!process.env.SPURTI_AI_FALLBACK_KEY && !doc.apiKeyEncrypted;
  return {
    provider: doc.provider,
    providerLabel: doc.providerLabel,
    baseUrl: doc.baseUrl,
    modelName: doc.modelName,
    apiKeyLast4: doc.apiKeyLast4,
    apiKeyConfigured: !!doc.apiKeyEncrypted,
    envFallbackActive,
    defaults: doc.defaults,
    dailyTokenCap: doc.dailyTokenCap,
    recentUsage: doc.recentUsage || [],
    isEnabled: doc.isEnabled,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy
  };
}

router.get('/config', adminGuard, async (_req, res) => {
  try {
    let doc = await AIConfig.findOne({ singleton: 'global' }).lean();
    if (!doc) doc = (await AIConfig.create({ singleton: 'global' })).toObject();
    res.json(publicShape(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', adminGuard, async (req, res) => {
  try {
    const {
      provider, providerLabel, baseUrl, modelName,
      apiKey,                  // plaintext key from the admin form. Stored encrypted, never echoed back.
      defaults, dailyTokenCap, isEnabled
    } = req.body || {};

    const update = {
      updatedAt: new Date(),
      updatedBy: String(req.headers['x-admin-email'] || '').toLowerCase()
    };

    if (provider) update.provider = provider;
    if (providerLabel != null) update.providerLabel = String(providerLabel).slice(0, 80);
    if (baseUrl) update.baseUrl = String(baseUrl).slice(0, 500);
    if (modelName) update.modelName = String(modelName).slice(0, 200);

    if (typeof apiKey === 'string' && apiKey.length > 0) {
      update.apiKeyEncrypted = encrypt(apiKey);
      update.apiKeyLast4 = last4(apiKey);
    } else if (apiKey === '') {
      // Explicit clear
      update.apiKeyEncrypted = '';
      update.apiKeyLast4 = '';
    }

    if (defaults && typeof defaults === 'object') {
      const d = update.defaults = update.defaults || {};
      if (Number.isFinite(defaults.questionCount)) d.questionCount = Math.max(1, Math.min(25, Math.floor(defaults.questionCount)));
      if (['easy', 'medium', 'hard'].includes(defaults.difficulty)) d.difficulty = defaults.difficulty;
      if (typeof defaults.includeExplanations === 'boolean') d.includeExplanations = defaults.includeExplanations;
    }
    if (Number.isFinite(dailyTokenCap)) update.dailyTokenCap = Math.max(0, Math.floor(dailyTokenCap));
    if (typeof isEnabled === 'boolean') update.isEnabled = isEnabled;

    const doc = await AIConfig.findOneAndUpdate(
      { singleton: 'global' },
      { $set: update },
      { new: true, upsert: true }
    ).lean();
    res.json(publicShape(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/test', adminGuard, async (req, res) => {
  try {
    let doc = await AIConfig.findOne({ singleton: 'global' }).lean();
    if (!doc) return res.status(400).json({ ok: false, error: 'AI Config is not initialized yet.' });

    // If the request body includes a candidate plaintext key, prefer it for the
    // test (so admins can validate a key BEFORE saving it). Otherwise test the
    // stored encrypted key.
    const candidate = req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey : '';
    if (candidate) {
      doc = { ...doc, _envFallbackKey: candidate };
    }
    const result = await testConnection(doc);
    res.json(result);
  } catch (err) {
    res.status(err.code === 'AUTH_FAILED' ? 401 : 502).json({
      ok: false,
      code: err.code || 'TEST_FAILED',
      error: err.message
    });
  }
});

router.delete('/config/key', adminGuard, async (_req, res) => {
  try {
    const doc = await AIConfig.findOneAndUpdate(
      { singleton: 'global' },
      { $set: { apiKeyEncrypted: '', apiKeyLast4: '', updatedAt: new Date() } },
      { new: true }
    ).lean();
    res.json(publicShape(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;