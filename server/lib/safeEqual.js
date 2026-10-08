import crypto from 'crypto';

// Constant-time string comparison, so a secret cannot be guessed one character
// at a time from response timing. Hashing first makes the two buffers the same
// length, which timingSafeEqual requires, without leaking the real length.
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
