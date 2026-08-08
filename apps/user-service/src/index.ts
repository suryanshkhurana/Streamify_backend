/**
 * User Service — Express bootstrap.
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  API Gateway (port 3000) → /users/*                            │
 *  └────────────────────┬────────────────────────────────────────────┘
 *                        │  HTTP :3002
 *  ┌────────────────────▼────────────────────────────────────────────┐
 *  │  User Service                                                   │
 *  │  ① Helmet  ② CORS  ③ Pino HTTP logger  ④ express.json          │
 *  │  ⑤ /users/* router (profile, follow, history)                  │
 *  │  ⑥ notFound + globalErrorHandler                                │
 *  │                                                                 │
 *  │  Data layer:                                                    │
 *  │    MongoDB   — Profile, Follow, ListeningHistory collections    │
 *  │    Redis     — Profile cache (10-min TTL, invalidated on PUT)   │
 *  └─────────────────────────────────────────────────────────────────┘
 */


import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import {
  httpLogger,
  logger,
  notFound,
  globalErrorHandler,
} from '@streamify/shared-middleware';

import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { startConsumer } from './events/consumer.js';
import userRouter from './routes/user.routes.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

// ─── Application ─────────────────────────────────────────────────────────────
const app: Application = express();

// ── ① Security headers ───────────────────────────────────────────────────────
app.use(helmet());

// ── ② CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Request-Id'],
  }),
);

// ── ③ Pino HTTP logger ───────────────────────────────────────────────────────
app.use(httpLogger);

// ── ④ Body parser ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── ⑤ Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'user-service',
    status: 'ok',
    env: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── ⑥ Routes ─────────────────────────────────────────────────────────────────
app.use('/users', userRouter);

// ── ⑦ 404 + Global error handler ─────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // MongoDB
  await connectDB();
  logger.info('[mongodb] connected');

  // Redis (non-fatal — service works without cache)
  try {
    await connectRedis();
    logger.info('[redis] connected and ready');
  } catch (err) {
    logger.warn({ err }, '[redis] could not connect — profile caching disabled');
  }

  // RabbitMQ consumer (non-fatal — reconnects automatically)
  await startConsumer();

  app.listen(PORT, () => {
    logger.info(`[user-service] listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, '[user-service] fatal startup error');
  process.exit(1);
});

export default app;
