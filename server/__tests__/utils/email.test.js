import { normalizeEmail, maskEmail } from '../../utils/email.js';

describe('normalizeEmail', () => {
  test('lowercases and trims', () => {
    expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
  });

  test('handles empty/null/undefined', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });

  test('handles single-word input', () => {
    expect(normalizeEmail('test')).toBe('test');
  });
});

describe('maskEmail', () => {
  test('masks middle characters of name', () => {
    expect(maskEmail('test@example.com')).toBe('te***@example.com');
  });

  test('handles short names (2 chars)', () => {
    expect(maskEmail('ab@example.com')).toBe('ab***@example.com');
  });

  test('handles 3-char names', () => {
    expect(maskEmail('abc@example.com')).toBe('ab***@example.com');
  });

  test('handles 4-char names', () => {
    expect(maskEmail('abcd@example.com')).toBe('ab***@example.com');
  });

  test('handles 5+ char names (preserves last 2 chars)', () => {
    expect(maskEmail('alexx@example.com')).toBe('al***xx@example.com');
  });

  test('handles empty/invalid emails', () => {
    expect(maskEmail('')).toBe('hidden email');
    expect(maskEmail(null)).toBe('hidden email');
    expect(maskEmail('notanemail')).toBe('hidden email');
  });
});