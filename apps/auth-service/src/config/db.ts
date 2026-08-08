/**
 * Prisma Client singleton.
 *
 * In development, Next.js / tsx hot-reload creates multiple module instances,
 * each bootstrapping a new PrismaClient and exhausting the connection pool.
 * The `global.__prisma` pattern prevents this by reusing the same instance.
 *
 * In production there is only one Node process, so a plain `new PrismaClient()`
 * is equivalent — but using the same pattern keeps the code identical across envs.
 */

import { PrismaClient } from '../../prisma/generated/client/index.js';

import { logger } from '@streamify/shared-middleware';

// ─── Extend global to hold the singleton ────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// ─── Create or reuse the Prisma client ───────────────────────────────────────

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'production'
        ? ['error']
        : ['query', 'warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

// ─── Connection helper ───────────────────────────────────────────────────────

/**
 * Connect to PostgreSQL and log the result.
 * Call this once during application bootstrap (src/index.ts).
 */
export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('[db] PostgreSQL connected via Prisma');
  } catch (err) {
    logger.error({ err }, '[db] Failed to connect to PostgreSQL');
    process.exit(1);
  }
}

/**
 * Gracefully disconnect Prisma on process shutdown.
 */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  logger.info('[db] PostgreSQL disconnected');
}
