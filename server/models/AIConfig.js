import mongoose from 'mongoose';

// Single-document collection ("global" AI config). Always at most one row.
// API key is stored encrypted (AES-256-GCM via services/crypto.js).
// Encrypted blob format: `${ivHex}:${authTagHex}:${ciphertextBase64}`.
const aiConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global', unique: true, index: true },
  provider: {
    type: String,
    enum: ['openai_compatible', 'anthropic'],
    default: 'openai_compatible'
  },
  // Display label for the admin (e.g. "OpenAI", "OpenRouter", "Local vLLM", "Anthropic")
  providerLabel: { type: String, default: 'OpenAI-compatible' },
  // Base URL: https://api.openai.com for OpenAI, https://openrouter.ai/api/v1 for OpenRouter,
  // http://localhost:8000/v1 for local vLLM/LM Studio, https://api.anthropic.com for Anthropic.
  baseUrl: { type: String, default: 'https://api.openai.com/v1' },
  // Model name the admin wants to use (e.g. gpt-4o-mini, claude-3-5-sonnet-20241022, openai/gpt-4o)
  modelName: { type: String, default: 'gpt-4o-mini' },
  // Encrypted key. We never persist plaintext. crypto.js handles encrypt/decrypt.
  apiKeyEncrypted: { type: String, default: '' },
  // Last 4 chars of the plaintext key, for display only. No security value — purely UX.
  apiKeyLast4: { type: String, default: '' },
  // Generation defaults the admin picked
  defaults: {
    questionCount: { type: Number, default: 5, min: 1, max: 25 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    includeExplanations: { type: Boolean, default: false }
  },
  // Token budget guardrail — daily ceiling across all AI calls.
  dailyTokenCap: { type: Number, default: 200000 },
  // Last 50 token-usage records (rolling). Used to enforce dailyTokenCap.
  recentUsage: [{
    timestamp: { type: Date, default: Date.now },
    tokensUsed: { type: Number, default: 0 },
    purpose: { type: String, default: 'generate_questions' }
  }],
  isEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' }
});

export default mongoose.model('AIConfig', aiConfigSchema);
