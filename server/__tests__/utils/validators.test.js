import {
  emailSchema,
  searchQuerySchema,
  pingBodySchema,
  confirmBodySchema,
  validateQuery,
  validateBody
} from '../../utils/validators.js';

describe('emailSchema', () => {
  test('accepts valid emails', () => {
    expect(emailSchema.parse('test@example.com')).toBe('test@example.com');
  });

  test('normalizes to lowercase and trims', () => {
    expect(emailSchema.parse('  TEST@Example.COM  ')).toBe('test@example.com');
  });

  test('rejects invalid emails', () => {
    expect(() => emailSchema.parse('not-an-email')).toThrow();
    expect(() => emailSchema.parse('')).toThrow();
    expect(() => emailSchema.parse('test')).toThrow();
  });
});

describe('searchQuerySchema', () => {
  test('accepts strings 2-100 chars', () => {
    expect(searchQuerySchema.parse('ab')).toBe('ab');
    expect(searchQuerySchema.parse('a'.repeat(100))).toBe('a'.repeat(100));
  });

  test('rejects too-short input', () => {
    expect(() => searchQuerySchema.parse('a')).toThrow();
    expect(() => searchQuerySchema.parse('')).toThrow();
  });
});

describe('pingBodySchema', () => {
  test('accepts valid ping body', () => {
    const result = pingBodySchema.parse({
      email: 'test@example.com',
      name: 'Test Student',
      page: 'record'
    });
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('Test Student');
    expect(result.page).toBe('record');
  });

  test('rejects missing fields', () => {
    expect(() => pingBodySchema.parse({})).toThrow();
    expect(() => pingBodySchema.parse({ email: 'test@example.com' })).toThrow();
  });

  test('rejects invalid email', () => {
    expect(() => pingBodySchema.parse({ email: 'not-email', name: 'Test', page: 'record' })).toThrow();
  });
});

describe('confirmBodySchema', () => {
  test('accepts valid confirm body', () => {
    const result = confirmBodySchema.parse({
      studentId: '507f1f77bcf86cd799439011',
      email: 'test@example.com'
    });
    expect(result.studentId).toBe('507f1f77bcf86cd799439011');
    expect(result.email).toBe('test@example.com');
  });
});

describe('validateBody middleware', () => {
  test('passes valid body and sets req.validatedBody', () => {
    const middleware = validateBody(pingBodySchema);
    const req = { body: { email: 'test@example.com', name: 'Test', page: 'record' } };
    let nextCalled = false;
    middleware(req, {}, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.validatedBody).toBeDefined();
    expect(req.validatedBody.email).toBe('test@example.com');
  });

  test('returns 400 for invalid body', () => {
    const middleware = validateBody(pingBodySchema);
    const req = { body: { email: 'not-email' } };
    let statusCode = null;
    middleware(req, { status: (c) => { statusCode = c; return ({ json: () => {} }); } }, () => {});
    expect(statusCode).toBe(400);
  });
});