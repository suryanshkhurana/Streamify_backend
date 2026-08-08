/**
 * stream-service — Express application bootstrap.
 *
 * Startup sequence:
 *  1. Parse and validate all environment variables
 *  2. Start the RabbitMQ consumer (background worker)
 *  3. Mount HTTP routes (signed URL endpoint)
 *  4. Start listening
 *  5. Graceful shutdown on SIGTERM / SIGINT
 */


import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';

import {
  globalErrorHandler,
  httpLogger,
  logger,
  notFound,
} from '@streamify/shared-middleware';

import { env } from './config/env.js';
import { startConsumer, closeConsumer } from './events/consumer.js';
import { closeRabbitMQ } from './events/publisher.js';
import streamRouter from './routes/stream.routes.js';

// ─── App ─────────────────────────────────────────────────────────────────────

const app: Application = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    methods: ['GET', 'OPTIONS'],
  }),
);

// ── Request parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(httpLogger);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    service: 'stream-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
    worker: 'track.uploaded consumer active',
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/stream', streamRouter);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Start the background RabbitMQ consumer
  await startConsumer();
  logger.info('[stream-service] RabbitMQ consumer started');

  app.listen(env.port, () => {
    logger.info(`[stream-service] listening on http://localhost:${env.port}`);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`[stream-service] received ${signal} — shutting down`);
  try {
    await closeConsumer();
    await closeRabbitMQ();
    logger.info('[stream-service] shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '[stream-service] error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, '[stream-service] Unhandled rejection');
  process.exit(1);
});

void bootstrap();

export default app;
