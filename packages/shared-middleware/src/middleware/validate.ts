import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod'; // eslint-disable-line @typescript-eslint/consistent-type-imports
import type { ZodSchema } from 'zod';

import { AppError } from '../errors/AppError.js';

/** Which part of the request to validate. */
export type ValidationTarget = 'body' | 'query' | 'params';

/**
 * validate — Zod schema validation middleware factory.
 *
 * Creates an Express middleware that validates `req[target]` against the
 * provided Zod schema. If validation passes, the parsed (and coerced) value
 * is written back to `req[target]` so downstream handlers receive clean data.
 *
 * On failure, forwards a structured 422 AppError to the global error handler.
 *
 * Usage — validate request body:
 * ```ts
 * import { z } from 'zod';
 * import { validate } from '@streamify/shared-middleware';
 *
 * const RegisterSchema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 *   displayName: z.string().min(2).max(50),
 * });
 *
 * router.post('/register',
 *   validate(RegisterSchema),          // body (default)
 *   catchAsync(authController.register),
 * );
 * ```
 *
 * Usage — validate query params:
 * ```ts
 * const SearchQuerySchema = z.object({
 *   q: z.string().min(1),
 *   page: z.coerce.number().int().positive().default(1),
 *   limit: z.coerce.number().int().min(1).max(100).default(20),
 * });
 *
 * router.get('/search', validate(SearchQuerySchema, 'query'), catchAsync(searchController.search));
 * ```
 *
 * @param schema  - Zod schema to validate against
 * @param target  - Which req property to validate ('body' | 'query' | 'params')
 */
export const validate = (
  schema: ZodSchema,
  target: ValidationTarget = 'body',
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (result.success) {
      // Write the parsed + coerced value back (e.g. z.coerce.number() on query strings)
      (req as Request & Record<string, unknown>)[target] = result.data as unknown;
      return next();
    }

    // Convert ZodError into a field-keyed errors map
    const errors = flattenZodErrors(result.error);

    next(
      new AppError('Validation failed', 422, { errors }),
    );
  };
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function flattenZodErrors(error: ZodError): Record<string, string[]> {
  return error.errors.reduce<Record<string, string[]>>((acc, issue) => {
    // e.g. path = ['address', 'city'] → key = 'address.city'
    const key = issue.path.join('.') || '_root';
    acc[key] = acc[key] ?? [];
    acc[key].push(issue.message);
    return acc;
  }, {});
}
