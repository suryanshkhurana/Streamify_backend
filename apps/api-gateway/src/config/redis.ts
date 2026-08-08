/**
 * Redis client for the API Gateway.
 * Used to back the rate-limiter store.
 */

import Redis from 'ioredis';
import { logger } from '@streamify/shared-middleware';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  family: 4, // Force IPv4 to fix Windows ::1 resolution issues
});

redis.on('connect', () => logger.info('[redis] connected'));
redis.on('ready', () => logger.info('[redis] ready'));
redis.on('error', (err: Error) =>
  logger.error({ err }, '[redis] connection error'),
);
redis.on('reconnecting', () => logger.warn('[redis] reconnecting…'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
