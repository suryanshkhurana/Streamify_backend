import type { Request, Response, NextFunction } from 'express';

import { AppError } from './AppError.js';

/**
 * notFound — catches any request that reaches this middleware without a matching route
 * and forwards a 404 AppError to the global error handler.
 *
 * Mount this BEFORE the globalErrorHandler, AFTER all real routes:
 * ```ts
 * app.use(notFound);
 * app.use(globalErrorHandler);
 * ```
 */
export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(
    new AppError(
      `Route not found: ${req.method} ${req.originalUrl}`,
      404,
    ),
  );
};
