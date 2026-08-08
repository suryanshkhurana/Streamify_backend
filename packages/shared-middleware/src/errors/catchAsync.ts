import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * catchAsync — wraps an async Express route handler so that any rejected
 * promise is automatically forwarded to Express's next(err) error pipeline.
 *
 * Without this wrapper, an unhandled async rejection silently swallows errors
 * in Express 4 (Express 5 handles this natively, but we're on Express 4).
 *
 * Usage:
 * ```ts
 * router.get('/me', catchAsync(async (req, res) => {
 *   const user = await userService.findById(req.userId!);
 *   res.json({ success: true, data: user });
 * }));
 * ```
 */
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};
