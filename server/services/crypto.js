// Symmetric encryption for at-rest secrets (e.g. AIConfig.apiKeyEncrypted).
// Uses AES-256-GCM. Master key derived from SPURTI_AI_SECRET env var (or a
// process-scoped fallback if absent — NOT plaintext on disk, but a stable
// derived value so a single server boot always reads its own writes).
//
// Encoded blob: `${ivHex}:${authTagHex}:${ciphertextBase64}` — all three are
// necessary; never edit by hand. Decryption returns the original UTF-8 string.

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;     // GCM standard
const KEY_BYTES = 32;    // AES-256
const SCRYPT_SALT = 'spurti-ai-config-v1';

function deriveKey(secret) {
  // scrypt: stronger than a single hash, slow on purpose to resist brute force
  // on a stolen DB. salt is constant per app version — that's fine because the
  // secret itself is the entropy source.
  return crypto.scryptSync(String(secret), SCRYPT_SALT, KEY_BYTES);
}

function getKey() {
  const secret = process.env.SPURTI_AI_SECRET;
  if (secret && secret.length >= 16) return deriveKey(secret);

  // Fallback: derive a stable key from a process-scoped fingerprint. This is
  // NOT a real secret (it's only as good as process memory), but it ensures
  // encryption+decryption work in the same boot. The admin can upgrade by
  // setting SPURTI_AI_SECRET in .env.
  if (!process.env.SPURTI_AI_FALLBACK_WARNED) {
    process.env.SPURTI_AI_FALLBACK_WARNED = '1';
    console.warn(
      '[ai-crypto] SPURTI_AI_SECRET not set or too short. ' +
      'Falling back to a process-scoped derived key. ' +
      'AI API keys will not survive a process restart. ' +
      'Set SPURTI_AI_SECRET (>=16 chars) in .env for persistence.'
    );
  }
  const fingerprint =
    (process.env.HOSTNAME || 'spurti') + '|' +
    (process.cwd() || '') + '|' +
    process.pid;
  return deriveKey(fingerprint);
}

export function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('base64')}`;
}

export function decrypt(blob) {
  if (!blob) return '';
  const parts = String(blob).split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, ctB64] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (err) {
    // Wrong key / tampered blob. Treat as missing rather than crashing.
    return '';
  }
}

// Helper for the admin UI: return only the last 4 chars, never the rest.
export function last4(plaintext) {
  if (!plaintext) return '';
  const s = String(plaintext);
  return s.length <= 4 ? s : s.slice(-4);
}