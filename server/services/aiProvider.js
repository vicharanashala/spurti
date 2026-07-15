// Unified LLM adapter. Two providers today:
//   - "openai_compatible": posts to {baseUrl}/chat/completions. Covers OpenAI,
//     OpenRouter, Together, Groq, vLLM, LM Studio, llama.cpp server, etc.
//   - "anthropic":         posts to https://api.anthropic.com/v1/messages.
//
// Public API:
//   testConnection(config)           -> { ok, message, model? }
//   generateQuestions({config, ...})  -> { questions, scrambledWords, raw, tokensUsed }
//   updateUsage(config, tokensUsed)
//
// Output contract for generateQuestions:
//   questions: [{ question, options[4], correctAnswer(0..3), timeLimit }]
//   scrambledWords: string[] (3-4 ALL-CAPS keywords for the unscramble mini-game)
//
// Failures are surfaced as thrown Error with `.code` so callers can map to HTTP.

import AIConfig from '../models/AIConfig.js';
import { decrypt } from './crypto.js';

const ANTHROPIC_VERSION = '2023-06-01';
const PER_QUESTION_TOKEN_BUDGET = 350;     // rough cap so a 20-question quiz doesn't blow the daily cap
const DEFAULT_TIMEOUT_MS = 60_000;

// ── helpers ────────────────────────────────────────────────────────────────

function stripCodeFences(s) {
  // Models often wrap JSON in ```json ... ```. Strip the wrappers but keep the body.
  const m = String(s).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : String(s).trim();
}

function safeParseJSON(s) {
  // Try strict parse, then a permissive "find first {...} block" recovery.
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fallthrough */ }
  }
  return null;
}

function normalizeQuestion(q, idx) {
  // Be defensive — models hallucinate, omit fields, return stringy indices, etc.
  if (!q || typeof q !== 'object') return null;
  const text = String(q.question || '').trim();
  let opts = Array.isArray(q.options) ? q.options : [];
  opts = opts.slice(0, 6).map((o) => String(o || '').trim()).filter(Boolean);
  while (opts.length < 2) opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
  let ans = Number(q.correctAnswer);
  if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) ans = 0;
  const t = Number(q.timeLimit);
  return {
    question: text || `Question ${idx + 1}`,
    options: opts,
    correctAnswer: ans,
    timeLimit: Number.isFinite(t) && t > 0 ? Math.min(120, Math.floor(t)) : 20
  };
}

function pickKeywords(transcript, max = 4) {
  // Used as a backup if the model omits scrambledWords.
  const stop = new Set(['about', 'before', 'should', 'through', 'would', 'people', 'session',
    'intern', 'meeting', 'transcript', 'really', 'actually', 'going', 'thing', 'things',
    'there', 'their', 'these', 'those', 'where', 'which', 'while', 'other']);
  const counts = new Map();
  for (const raw of String(transcript || '').toLowerCase().split(/\s+/)) {
    const w = raw.replace(/[^a-z]/g, '');
    if (w.length < 5 || stop.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w.toUpperCase());
  const fillers = ['SPURTI', 'ENERGY', 'COHORT', 'SESSION'];
  while (top.length < 3) top.push(fillers[top.length] || 'TOPIC');
  return top;
}

// ── env override ────────────────────────────────────────────────────────────
// If Mongo has no key but SPURTI_AI_FALLBACK_KEY is set in .env, use it.
// Lets production deploys set a system-wide key without touching the DB.
function applyEnvFallback(config) {
  if (config.apiKeyEncrypted) return config;
  const fb = process.env.SPURTI_AI_FALLBACK_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!fb) return config;

  let defaultBaseUrl = config.baseUrl;
  let defaultModel = config.modelName;
  let defaultProvider = config.provider;

  if (!process.env.SPURTI_AI_FALLBACK_KEY) {
    if (process.env.GROQ_API_KEY) {
      defaultBaseUrl = 'https://api.groq.com/openai/v1';
      defaultModel = 'llama-3.3-70b-versatile';
      defaultProvider = 'openai_compatible';
    } else if (process.env.OPENAI_API_KEY) {
      defaultBaseUrl = 'https://api.openai.com/v1';
      defaultModel = 'gpt-4o-mini';
      defaultProvider = 'openai_compatible';
    } else if (process.env.ANTHROPIC_API_KEY) {
      defaultBaseUrl = 'https://api.anthropic.com';
      defaultModel = 'claude-3-5-sonnet-20241022';
      defaultProvider = 'anthropic';
    }
  }

  return {
    ...config,
    provider: defaultProvider,
    _envFallbackKey: fb,
    _effectiveBaseUrl: process.env.SPURTI_AI_FALLBACK_BASE_URL || defaultBaseUrl,
    _effectiveModel: process.env.SPURTI_AI_FALLBACK_MODEL || defaultModel
  };
}

// ── config resolution ───────────────────────────────────────────────────────

export async function getEffectiveConfig() {
  let config = await AIConfig.findOne({ singleton: 'global' }).lean();
  if (!config) {
    config = (await AIConfig.create({ singleton: 'global' })).toObject();
  }
  return applyEnvFallback(config);
}

function resolveKeyAndEndpoints(config) {
  const apiKey = config._envFallbackKey || decrypt(config.apiKeyEncrypted) || '';
  const baseUrl = (config._effectiveBaseUrl || config.baseUrl || '').replace(/\/+$/, '');
  const modelName = config._effectiveModel || config.modelName || '';
  return { apiKey, baseUrl, modelName };
}

// ── OpenAI-compatible adapter ───────────────────────────────────────────────

async function callOpenAICompatible({ apiKey, baseUrl, modelName, messages, timeoutMs, responseFormat = { type: 'json_object' } }) {
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: modelName,
    messages,
    temperature: 0.4
  };
  if (responseFormat) {
    body.response_format = responseFormat;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`OpenAI-compatible upstream ${res.status}: ${text.slice(0, 240)}`);
    err.code = res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'UPSTREAM_ERROR';
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  const tokensUsed =
    (data?.usage?.total_tokens) ||
    (data?.usage?.prompt_tokens || 0) + (data?.usage?.completion_tokens || 0) ||
    0;
  return { content, tokensUsed };
}

// ── Anthropic adapter ───────────────────────────────────────────────────────

async function callAnthropic({ apiKey, baseUrl, modelName, systemPrompt, userPrompt, timeoutMs }) {
  const url = `${baseUrl}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true' // server-to-server, harmless
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 2048,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }),
    signal: AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Anthropic upstream ${res.status}: ${text.slice(0, 240)}`);
    err.code = res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'UPSTREAM_ERROR';
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const content = (data?.content?.[0]?.text) || '';
  const tokensUsed =
    (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0) ||
    0;
  return { content, tokensUsed };
}

// ── prompt ──────────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return [
    'You generate contest questions for a residential summer internship program.',
    'Return ONLY a single JSON object — no prose, no code fences, no commentary.',
    'Schema:',
    '{',
    '  "questions": [ { "question": string, "options": string[4], "correctAnswer": 0|1|2|3, "timeLimit": 20 } ],',
    '  "scrambledWords": string[3..4]  // ALL-CAPS keywords for a word-scramble mini-game',
    '}',
    'Rules:',
    '- Every question MUST have exactly 4 options.',
    '- correctAnswer is the 0-based index of the correct option.',
    '- Every option must be plausible (no obviously-wrong throwaways).',
    '- Keep language accessible to undergraduate interns.',
    '- Base every question strictly on the provided transcript; do not invent facts.'
  ].join('\n');
}

function buildUserPrompt({ transcript, count, difficulty, topicHint }) {
  const tl = Math.max(1, Math.min(25, Number(count) || 5));
  const diff =
    difficulty === 'easy' ? 'Easy — recall and basic comprehension.' :
    difficulty === 'hard' ? 'Hard — application, analysis, edge cases.' :
    'Medium — mix of recall and application.';
  const hint = topicHint ? `Focus on: ${topicHint}.\n` : '';
  return [
    `Generate ${tl} multiple-choice questions from the transcript below.`,
    `Difficulty: ${diff}`,
    hint,
    '',
    '--- TRANSCRIPT ---',
    String(transcript || '').slice(0, 24_000) // cap so we don't blow tokens
  ].join('\n');
}

// ── public API ──────────────────────────────────────────────────────────────

export async function testConnection(rawConfig) {
  const { apiKey, baseUrl, modelName } = resolveKeyAndEndpoints(rawConfig);
  if (!apiKey) {
    const err = new Error('No API key configured. Add a key in AI Config.');
    err.code = 'NO_KEY';
    throw err;
  }
  const messages = [
    { role: 'system', content: 'Reply with exactly the single word: pong' },
    { role: 'user', content: 'ping' }
  ];
  if (rawConfig.provider === 'anthropic') {
    return await callAnthropic({
      apiKey, baseUrl, modelName,
      systemPrompt: messages[0].content, userPrompt: messages[1].content,
      timeoutMs: 20_000
    }).then((r) => ({ ok: true, message: 'Connection succeeded', model: modelName, tokensUsed: r.tokensUsed }));
  }
  const r = await callOpenAICompatible({
    apiKey, baseUrl, modelName, messages, timeoutMs: 20_000,
    responseFormat: null
  });
  return { ok: true, message: 'Connection succeeded', model: modelName, tokensUsed: r.tokensUsed };
}

export async function generateQuestions({ transcript, count, difficulty, topicHint }) {
  const config = await getEffectiveConfig();
  if (!config.isEnabled) {
    const err = new Error('AI generation is disabled in AI Config.');
    err.code = 'DISABLED';
    throw err;
  }
  const { apiKey, baseUrl, modelName } = resolveKeyAndEndpoints(config);
  if (!apiKey) {
    const err = new Error('No API key configured.');
    err.code = 'NO_KEY';
    throw err;
  }

  // Daily cap guardrail — refuse before spending tokens if we're already over.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const usedToday = (config.recentUsage || [])
    .filter((u) => new Date(u.timestamp) >= todayStart)
    .reduce((sum, u) => sum + (u.tokensUsed || 0), 0);
  const projected = usedToday + PER_QUESTION_TOKEN_BUDGET * Math.max(1, Number(count) || 5);
  if (projected > Number(config.dailyTokenCap || 0)) {
    const err = new Error(`Daily token cap would be exceeded (used ${usedToday}, cap ${config.dailyTokenCap}). Increase the cap or wait until tomorrow.`);
    err.code = 'CAP_EXCEEDED';
    throw err;
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ transcript, count, difficulty, topicHint });

  let raw;
  let tokensUsed = 0;
  if (config.provider === 'anthropic') {
    raw = await callAnthropic({
      apiKey, baseUrl, modelName, systemPrompt, userPrompt
    });
    tokensUsed = raw.tokensUsed;
    raw = raw.content;
  } else {
    const r = await callOpenAICompatible({
      apiKey, baseUrl, modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    tokensUsed = r.tokensUsed;
    raw = r.content;
  }

  const parsed = safeParseJSON(stripCodeFences(raw));
  if (!parsed || !Array.isArray(parsed.questions)) {
    const err = new Error('Model did not return valid JSON. Try a different model or reduce difficulty.');
    err.code = 'BAD_OUTPUT';
    err.raw = raw.slice(0, 500);
    throw err;
  }

  const questions = parsed.questions.map(normalizeQuestion).filter(Boolean);
  if (questions.length === 0) {
    const err = new Error('Model returned no usable questions.');
    err.code = 'EMPTY_OUTPUT';
    throw err;
  }

  const scrambledWords = Array.isArray(parsed.scrambledWords) && parsed.scrambledWords.length
    ? parsed.scrambledWords.map((w) => String(w || '').toUpperCase()).filter(Boolean).slice(0, 4)
    : pickKeywords(transcript, 4);

  // Record usage asynchronously — don't block the response on a write.
  updateUsage(config, tokensUsed).catch(() => { /* best-effort */ });

  return {
    questions,
    scrambledWords,
    raw,
    tokensUsed,
    provider: config.provider,
    model: modelName
  };
}

async function updateUsage(config, tokensUsed) {
  if (!tokensUsed) return;
  await AIConfig.updateOne(
    { singleton: 'global' },
    {
      $push: {
        recentUsage: {
          $each: [{ timestamp: new Date(), tokensUsed, purpose: 'generate_questions' }],
          $slice: -50 // keep the rolling window bounded
        }
      }
    }
  );
}
