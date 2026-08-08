import type { ApiError } from '@streamify/shared-types';
import type { Request, Response, NextFunction } from 'express';


import { logger } from '../middleware/logger.js';

import { AppError } from './AppError.js';

/**
 * globalErrorHandler — Express 4-argument error-handling middleware.
 *
 * Must be registered LAST in the Express middleware chain:
 * ```ts
 * app.use(notFound);
 * app.use(globalErrorHandler);
 * ```
 *
 * Behaviour:
 *  - AppError (operational) → logs at `warn` level, sends structured JSON
 *  - Unknown Error (programming bug) → logs at `error` level with full stack,
 *    sends generic 500 (stack only exposed in development)
 *  - JWT errors → remapped to 401
 *  - Mongoose validation / cast errors → remapped to 400 / 404
 */
export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // ── Normalise known third-party errors into AppError ────────────────────

  const error = remapError(err);

  // ── Log ─────────────────────────────────────────────────────────────────

  const isProduction = process.env['NODE_ENV'] === 'production';

  if (error.isOperational) {
    logger.warn(
      { err: error, req: { method: req.method, url: req.originalUrl } },
      `[${error.statusCode}] ${error.message}`,
    );
  } else {
    logger.error(
      { err: error, req: { method: req.method, url: req.originalUrl } },
      `[UNHANDLED ERROR] ${error.message}`,
    );
  }

  // ── Respond ─────────────────────────────────────────────────────────────

  const body: ApiError = {
    success: false,
    statusCode: error.statusCode,
    message: error.isOperational ? error.message : 'Something went wrong',
    ...(error.errors && { errors: error.errors }),
    ...(!isProduction && !error.isOperational && { stack: error.stack }),
  };

  res.status(error.statusCode).json(body);
};

// ─── Error remapping helpers ─────────────────────────────────────────────────

function remapError(err: Error): AppError {
  // Already an AppError — pass through
  if (err instanceof AppError) {
    return err;
  }

  const name = err.name;
  const message = err.message;

  // jsonwebtoken errors
  if (name === 'JsonWebTokenError' || name === 'NotBeforeError') {
    return new AppError('Invalid token', 401);
  }
  if (name === 'TokenExpiredError') {
    return new AppError('Token has expired', 401);
  }

  // Mongoose CastError (invalid ObjectId)
  if (name === 'CastError') {
    return new AppError('Invalid resource ID format', 400);
  }

  // Mongoose ValidationError
  if (name === 'ValidationError') {
    return new AppError(`Validation failed: ${message}`, 400);
  }

  // MongoDB duplicate key (E11000)
  if ('code' in err && ((err as NodeJS.ErrnoException).code === 'ERRDUPLICATEKEY' || message.includes('E11000'))) {
    return new AppError('Duplicate field value — this resource already exists', 409);
  }

  // Prisma unique constraint violation (P2002)
  if ('code' in err && (err as Record<string, unknown>)['code'] === 'P2002') {
    return new AppError('Duplicate field value — this resource already exists', 409);
  }

  // Prisma record not found (P2025)
  if ('code' in err && (err as Record<string, unknown>)['code'] === 'P2025') {
    return new AppError('Resource not found', 404);
  }

  // Fallback — unknown / programming error
  return new AppError(message || 'Internal Server Error', 500, {
    isOperational: false,
  });
}
