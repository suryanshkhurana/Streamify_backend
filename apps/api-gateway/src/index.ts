/**
 * API Gateway — Express bootstrap.
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  Browser / Mobile / Postman                                     │
 *  └────────────────────┬────────────────────────────────────────────┘
 *                        │  HTTP :3000
 *  ┌────────────────────▼────────────────────────────────────────────┐
 *  │  API Gateway                                                    │
 *  │  ① Helmet  ② CORS  ③ Pino HTTP logger                          │
 *  │  ④ Global rate-limiter (Redis-backed, 200 req / 15 min / IP)   │
 *  │  ⑤ /auth  → strict auth rate-limiter (30 req / 15 min)         │
 *  │  ⑥ Route auth:                                                  │
 *  │     public   → no JWT needed                                    │
 *  │     optional → JWT decoded if present (optionalAuthenticate)    │
 *  │     required → valid JWT mandatory   (authenticate)             │
 *  │  ⑦ http-proxy-middleware forwards to upstream service           │
 *  │  ⑧ notFound + globalErrorHandler                                │
 *  └─────────────────────────────────────────────────────────────────┘
 */


import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import {
  httpLogger,
  logger,
  authenticate,
  optionalAuthenticate,
  notFound,
  globalErrorHandler,
} from '@streamify/shared-middleware';

import { connectRedis } from './config/redis.js';
// import { globalLimiter, authLimiter } from './config/rateLimiter.js'; // [LOAD TESTING] Temporarily disabled
import { createUpstreamProxy } from './proxy/upstream.js';
import { ROUTES } from './routes/index.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

// ─── Application ─────────────────────────────────────────────────────────────
const app: Application = express();

// ── ① Security headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Gateway only proxies; CSP is set by each service
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ── ② CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  }),
);

// ── ③ Pino request/response logger ───────────────────────────────────────────
app.use(httpLogger);

// ── ④ Global rate-limiter ────────────────────────────────────────────────────
// app.use(globalLimiter); // [LOAD TESTING] Temporarily disabled

// ── ⑤ Health check (bypass all auth / rate-limit concerns) ───────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'api-gateway',
    status: 'ok',
    env: NODE_ENV,
    timestamp: new Date().toISOString(),
    upstreams: ROUTES.map(r => ({
      prefix: r.prefix,
      service: r.service,
      port: r.port,
      auth: r.auth,
    })),
  });
});

// ─── Mount each upstream route ───────────────────────────────────────────────
for (const route of ROUTES) {
  const target = process.env[route.urlEnv] || `http://localhost:${route.port}`;
  const proxy = createUpstreamProxy(target, route.service, route.prefix);

  // Stricter rate-limit for authentication endpoints
  if (route.prefix === '/auth') {
    app.use(route.prefix, /* authLimiter, */ proxy); // [LOAD TESTING] Temporarily disabled
    continue;
  }

  // Apply the appropriate auth middleware based on the route config
  switch (route.auth) {
    case 'public':
      app.use(route.prefix, proxy);
      break;

    case 'optional':
      app.use(route.prefix, optionalAuthenticate, proxy);
      break;

    case 'required':
      app.use(route.prefix, authenticate, proxy);
      break;
  }
}

// ── ⑦ 404 + Global error handler ─────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Connect Redis (for rate-limiter store)
  try {
    await connectRedis();
    logger.info('[redis] connected and ready');
  } catch (err) {
    logger.warn({ err }, '[redis] could not connect — rate-limiter will use in-memory store');
  }

  app.listen(PORT, () => {
    logger.info(`[api-gateway] listening on http://localhost:${PORT}`);
    logger.info(
      { routes: ROUTES.map(r => `${r.auth.toUpperCase().padEnd(8)} ${r.prefix} → :${r.port}`) },
      '[api-gateway] route table',
    );
  });
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, '[api-gateway] fatal startup error');
  process.exit(1);
});

export default app;
