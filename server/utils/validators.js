import { z } from 'zod';

export const emailSchema = z.string().trim().email().max(320).transform(v => v.toLowerCase());

export const searchQuerySchema = z.string().min(2).max(100).trim();

export const studentIdSchema = z.string().max(24);

export const leaderboardTypeSchema = z.enum(['overall', 'my_onboarding_group']);

export const pageSchema = z.string().min(1).max(60);

export const pingBodySchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(200),
  page: pageSchema
});

export const confirmBodySchema = z.object({
  studentId: z.string().min(1).max(24),
  email: emailSchema
});

export const surveyCompleteBodySchema = z.object({
  email: emailSchema.optional()
});

export const statusQuerySchema = z.enum(['active', 'excused', 'yet to onboard']);

export const limitQuerySchema = (def, min = 1, max = 500) =>
  z.string().regex(/^\d+$/).transform(Number).refine(v => v >= min && v <= max, { message: `must be between ${min} and ${max}` }).default(String(def));

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid query', details: result.error.flatten() });
    }
    req.validatedQuery = result.data;
    next();
  };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request body', details: result.error.flatten() });
    }
    req.validatedBody = result.data;
    next();
  };
}