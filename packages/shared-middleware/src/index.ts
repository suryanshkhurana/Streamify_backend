/**
 * @streamify/shared-middleware
 *
 * Shared Express middleware, error handling utilities, and the Pino logger
 * used by every Streamify backend service.
 *
 * ─── Errors ──────────────────────────────────────────────────────────────────
 * AppError           Custom operational error class (statusCode, isOperational)
 * catchAsync         Wraps async route handlers to forward rejections to next()
 * globalErrorHandler 4-argument Express error middleware — mount last
 * notFound           404 handler — mount before globalErrorHandler
 *
 * ─── Middleware ───────────────────────────────────────────────────────────────
 * authenticate         JWT Bearer token verification — attaches req.userId / req.user
 * optionalAuthenticate Same but does not reject unauthenticated requests
 * httpLogger           Pino-HTTP request/response logging middleware
 * validate             Zod schema validation factory (body | query | params)
 *
 * ─── Logger ───────────────────────────────────────────────────────────────────
 * logger               Pino Logger instance (use directly in services)
 *
 * ─── Types ────────────────────────────────────────────────────────────────────
 * ValidationTarget     'body' | 'query' | 'params'
 *
 * ─── Typical service setup ────────────────────────────────────────────────────
 * ```ts
 * import {
 *   httpLogger,
 *   authenticate,
 *   notFound,
 *   globalErrorHandler,
 * } from '@streamify/shared-middleware';
 *
 * app.use(httpLogger);
 * // ... mount your routes ...
 * app.use(notFound);
 * app.use(globalErrorHandler);
 * ```
 */

// ── Errors ─────────────────────────────────────────────────────────────────
export { AppError } from './errors/AppError.js';
export { catchAsync } from './errors/catchAsync.js';
export { globalErrorHandler } from './errors/errorHandler.js';
export { notFound } from './errors/notFound.js';

// ── Middleware ──────────────────────────────────────────────────────────────
export { authenticate, optionalAuthenticate } from './middleware/authenticate.js';
export { httpLogger, logger } from './middleware/logger.js';
export { validate, type ValidationTarget } from './middleware/validate.js';
