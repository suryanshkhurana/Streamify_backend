/**
 * auth-service — Express application bootstrap.
 *
 * Startup sequence:
 *  1. Connect to PostgreSQL (Prisma)
 *  2. Connect to Redis (ioredis)
 *  3. Mount all middleware and routes
 *  4. Start listening
 *  5. Register graceful shutdown handlers (SIGTERM / SIGINT)
 */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import passport from 'passport';

import {
  globalErrorHandler,
  httpLogger,
  logger,
  notFound,
} from '@streamify/shared-middleware';

import { connectDb, disconnectDb } from './config/db.js';
import { configurePassport } from './config/passport.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { closeRabbitMQ } from './events/publisher.js';
import authRouter from './routes/auth.routes.js';

// ─── App ─────────────────────────────────────────────────────────────────────

const app: Application = express();
const PORT = process.env['PORT'] ?? 3001;

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true, // required for cookies
  }),
);

// ─── Request parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' })); // prevent large body attacks
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ─── HTTP request logging ─────────────────────────────────────────────────────

app.use(httpLogger);

// ─── Passport.js ─────────────────────────────────────────────────────────────
// configurePassport() registers the Google strategy (soft no-op if env vars
// are missing so the service starts cleanly in CI/test environments).
configurePassport();
app.use(passport.initialize()); // Attach passport to every request

// ─── Health check (unauthenticated) ─────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    service: 'auth-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/auth', authRouter);

// ─── Error handling (must be last) ───────────────────────────────────────────

app.use(notFound);
app.use(globalErrorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // 1. Databases
  await connectDb();
  await connectRedis();

  // 2. Start server
  app.listen(PORT, () => {
    logger.info(`[auth-service] listening on http://localhost:${PORT}`);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`[auth-service] received ${signal} — shutting down gracefully`);
  try {
    await disconnectDb();
    await disconnectRedis();
    await closeRabbitMQ();
    logger.info('[auth-service] shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '[auth-service] Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

// Unhandled promise rejections — log and exit (let the orchestrator restart)
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, '[auth-service] Unhandled promise rejection');
  process.exit(1);
});

void bootstrap();

export default app;
