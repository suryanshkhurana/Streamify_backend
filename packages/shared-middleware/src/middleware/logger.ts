import pino, { type Logger } from 'pino';
import pinoHttp, { type HttpLogger } from 'pino-http';

// ─── Base logger ─────────────────────────────────────────────────────────────

/**
 * Shared Pino logger instance.
 *
 * Configuration:
 *  - Log level from LOG_LEVEL env var (defaults to "info")
 *  - Pretty-print in development (when NODE_ENV !== 'production')
 *  - Structured JSON in production (for log aggregators: Datadog, CloudWatch, etc.)
 *
 * Usage in a service:
 * ```ts
 * import { logger } from '@streamify/shared-middleware';
 * logger.info({ userId }, 'User logged in');
 * logger.error({ err }, 'Database connection failed');
 * ```
 */
export const logger: Logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  // Timestamp in ISO-8601 format (easier to read than epoch ms)
  timestamp: pino.stdTimeFunctions.isoTime,
  // Rename 'pid' and 'hostname' keys to shorter names in production
  base: {
    pid: process.pid,
    service: process.env['npm_package_name'] ?? 'streamify-service',
  },
  // Redact sensitive fields from log output
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.refreshToken',
      'body.accessToken',
    ],
    censor: '[REDACTED]',
  },
  // Pretty-print for local development
  ...(process.env['NODE_ENV'] !== 'production' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),
});

// ─── HTTP request logger ─────────────────────────────────────────────────────

/**
 * Pino HTTP middleware for Express.
 * Logs every incoming request and outgoing response at the "info" level.
 *
 * Skips health-check requests to avoid log noise.
 *
 * Usage:
 * ```ts
 * import { httpLogger } from '@streamify/shared-middleware';
 * app.use(httpLogger);
 * ```
 */
export const httpLogger: HttpLogger = pinoHttp({
  logger,
  // Skip health checks in logs to reduce noise
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  // Customise log level based on status code
  customLogLevel: (_req, res, err) => {
    if (err !== undefined || res.statusCode >= 500) { return 'error'; }
    if (res.statusCode >= 400) { return 'warn'; }
    return 'info';
  },
  // Serialise only the fields we care about from req / res
  customReceivedMessage: (req) =>
    `incoming request: ${req.method} ${req.url}`,
  customSuccessMessage: (req, res) =>
    `request completed: ${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (_req, _res, err) =>
    `request error: ${err.message}`,
  // Include relevant request properties
  serializers: {
    req: (req: Record<string, unknown>) => ({
      method: req['method'],
      url: req['url'],
      // Don't log the full body by default (may contain PII)
    }),
    res: (res: Record<string, unknown>) => ({
      statusCode: res['statusCode'],
    }),
  },
});
