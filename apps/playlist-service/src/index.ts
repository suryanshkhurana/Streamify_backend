/**
 * src/index.ts — playlist-service entry point
 *
 * Port 3006 — proxied from API Gateway at /playlists
 *
 * Middleware stack:
 *   helmet → cors → pino-http → express.json
 *   ↓
 *   /health          (public)
 *   /playlists       (see routes/playlist.routes.ts)
 *   ↓
 *   notFound → globalErrorHandler
 */


import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import {
  httpLogger,
  logger,
  notFound,
  globalErrorHandler,
} from '@streamify/shared-middleware';

import { connectDB } from './config/db.js';
import playlistRouter from './routes/playlist.routes.js';
import likesRouter from './routes/likes.routes.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT        = parseInt(process.env['PORT'] ?? '3006', 10);
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';

// ─── Express app ──────────────────────────────────────────────────────────────
const app: Application = express();

app.use(helmet());
app.use(
  cors({
    origin:         CORS_ORIGIN,
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(httpLogger);
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    service:   'playlist-service',
    status:    'ok',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// API Gateway rewrites the path back to include the prefix.
app.use('/playlists', playlistRouter);
app.use('/likes', likesRouter);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`[playlist-service] listening on http://localhost:${PORT}`);
  });
}

start().catch((err: unknown) => {
  logger.fatal({ err }, '[playlist-service] fatal startup error');
  process.exit(1);
});

export default app;
