/**
 * ioredis client singleton.
 *
 * Redis is used by the auth-service for two purposes:
 *  1. **Refresh token store** — when a token is issued, its JTI (UUID) is stored
 *     with a TTL equal to the token's lifetime. On refresh / logout, the JTI is
 *     deleted, which effectively revokes the token without a DB lookup on every
 *     request.
 *  2. **Distributed rate limiting** (optional future use via the API gateway).
 *
 * Key schema:
 *   rt:<userId>:<tokenId>  →  "1"   TTL = REFRESH_TOKEN_TTL_SECONDS
 */

import Redis from 'ioredis';

import { logger } from '@streamify/shared-middleware';

// ─── Singleton ────────────────────────────────────────────────────────────────

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (redisClient) { return redisClient; }

  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    family: 4,
  });

  redisClient.on('connect', () => {
    logger.info('[redis] connected');
  });

  redisClient.on('ready', () => {
    logger.info('[redis] ready');
  });

  redisClient.on('error', (err: Error) => {
    logger.error({ err }, '[redis] connection error');
  });

  redisClient.on('close', () => {
    logger.warn('[redis] connection closed');
  });

  return redisClient;
}

// ─── Connect helper ───────────────────────────────────────────────────────────

/**
 * Explicitly connect to Redis during application bootstrap.
 * Exits the process if the connection cannot be established.
 */
export async function connectRedis(): Promise<void> {
  const client = getRedis();
  try {
    await client.connect();
    logger.info('[redis] connected and ready');
  } catch (err) {
    logger.error({ err }, '[redis] Failed to connect');
    process.exit(1);
  }
}

/**
 * Gracefully disconnect from Redis on process shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('[redis] disconnected');
  }
}

// ─── Key builders ─────────────────────────────────────────────────────────────

/**
 * Builds the Redis key for a refresh token entry.
 * @param userId  - The owner's user ID.
 * @param tokenId - The refresh token's UUID (JTI).
 */
export function refreshTokenKey(userId: string, tokenId: string): string {
  return `rt:${userId}:${tokenId}`;
}
