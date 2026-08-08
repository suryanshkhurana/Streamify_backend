/**
 * Prisma Client singleton for catalog-service.
 */

import { PrismaClient } from '../../prisma/generated/client/index.js';
import { logger } from '@streamify/shared-middleware';

declare global {
  // eslint-disable-next-line no-var
  var __prismaCatalog: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prismaCatalog ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'production'
        ? ['error']
        : ['warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prismaCatalog = prisma;
}

export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('[db] PostgreSQL connected via Prisma (catalog)');
  } catch (err) {
    logger.error({ err }, '[db] Failed to connect to PostgreSQL (catalog)');
    process.exit(1);
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  logger.info('[db] PostgreSQL disconnected (catalog)');
}
