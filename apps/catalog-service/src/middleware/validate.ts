/**
 * Zod validation middleware for catalog-service.
 * Validates req.body and req.query against a Zod schema.
 * On failure throws a 400 AppError with structured field-level errors.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { AppError } from '@streamify/shared-middleware';

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new AppError(`Validation failed: ${errors[0]?.message ?? 'Invalid input'}`, 400));
    }
    req.body = result.data as typeof req.body;
    next();
  };
}

export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new AppError(`Invalid query params: ${errors[0]?.message ?? 'Invalid input'}`, 400));
    }
    req.query = result.data as typeof req.query;
    next();
  };
}
