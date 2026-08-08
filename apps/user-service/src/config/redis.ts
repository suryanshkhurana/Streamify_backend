/**
 * Redis client for the user-service.
 * Used for profile caching (10-minute TTL).
 */

import Redis from 'ioredis';
import { logger } from '@streamify/shared-middleware';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  family: 4,
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

// ─── Cache key helpers ────────────────────────────────────────────────────────
export const PROFILE_CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

export function profileCacheKey(userId: string): string {
  return `user:profile:${userId}`;
}
