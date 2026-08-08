/**
 * catalog-service — Express application bootstrap.
 *
 * Startup sequence:
 *  1. Connect to PostgreSQL (Prisma)
 *  2. Mount all middleware and routes
 *  3. Start listening
 *  4. Register graceful shutdown handlers (SIGTERM / SIGINT)
 */

// Handle Prisma BigInt serialization
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';

import {
  globalErrorHandler,
  httpLogger,
  logger,
  notFound,
} from '@streamify/shared-middleware';

import { connectDb, disconnectDb } from './config/db.js';
import { closeRabbitMQ } from './events/publisher.js';
import artistRouter from './routes/artist.routes.js';
import albumRouter from './routes/album.routes.js';
import trackRouter from './routes/track.routes.js';
import internalRouter from './routes/internal.routes.js';

// ─── App ─────────────────────────────────────────────────────────────────────

const app: Application = express();
const PORT = process.env['PORT'] ?? 3003;

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  }),
);

// ─── Request parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// ─── HTTP request logging ─────────────────────────────────────────────────────

app.use(httpLogger);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    service: 'catalog-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/catalog/artists', artistRouter);
app.use('/catalog/albums', albumRouter);
app.use('/catalog/tracks', trackRouter);

// Internal service-to-service routes (not exposed through API Gateway)
app.use('/internal', internalRouter);

// ─── Error handling (must be last) ───────────────────────────────────────────

app.use(notFound);
app.use(globalErrorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await connectDb();

  app.listen(PORT, () => {
    logger.info(`[catalog-service] listening on http://localhost:${PORT}`);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`[catalog-service] received ${signal} — shutting down gracefully`);
  try {
    await disconnectDb();
    await closeRabbitMQ();
    logger.info('[catalog-service] shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '[catalog-service] Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, '[catalog-service] Unhandled promise rejection');
  process.exit(1);
});

void bootstrap();

export default app;
