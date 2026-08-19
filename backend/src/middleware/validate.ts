import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.error.issues[0]?.message ?? 'Invalid request body.' });
    }
    req.body = result.data;
    next();
  };
}
