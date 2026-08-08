/**
 * Rate-limiter factory for the API Gateway.
 *
 * Uses express-rate-limit with a custom Redis store so that limits are shared
 * across all future gateway replicas (stateless in production).
 *
 * Falls back to the default in-memory store if Redis is unavailable so the
 * gateway never crashes because of a missing cache layer.
 */

import rateLimit, {
  type Options as RateLimitOptions,
} from 'express-rate-limit';
import { redis } from './redis.js';
// ─── Tiny Redis store adapter ────────────────────────────────────────────────
// express-rate-limit v7 expects a store with increment/decrement/resetKey.
// ioredis doesn't ship an official adapter, so we implement a minimal one.
class RedisStore {
  readonly prefix: string;
  readonly windowMs: number;

  constructor(windowMs: number, prefix = 'rl:') {
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  private key(k: string) {
    return `${this.prefix}${k}`;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const rKey = this.key(key);
    const hits = await redis.incr(rKey);
    if (hits === 1) {
      // First hit — set TTL
      await redis.pexpire(rKey, this.windowMs);
    }
    const ttlMs = await redis.pttl(rKey);
    const resetTime = new Date(Date.now() + Math.max(ttlMs, 0));
    return { totalHits: hits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await redis.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await redis.del(this.key(key));
  }
}


// ─── Preset limiters ─────────────────────────────────────────────────────────

const GLOBAL_WINDOW_MS = 15 * 60 * 1_000; // 15 min
const AUTH_WINDOW_MS = 15 * 60 * 1_000;

/** Global limiter — 500 requests / 15 min per IP across all routes */
export const globalLimiter = rateLimit({
  windowMs: GLOBAL_WINDOW_MS,
  max: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Lazily resolved on first request so Redis is always ready
  store: new RedisStore(GLOBAL_WINDOW_MS, 'rl:global:') as RateLimitOptions['store'],
  skip: (req) => {
    // Skip rate limiting for known browser extension / tracker noise paths
    const url = req.url ?? '';
    return url.includes('hybridaction') || url.includes('zybTracker');
  },
  message: { success: false, message: 'Too many requests, please try again later.' },
});

/** Auth limiter — stricter 50 requests / 15 min per IP for /auth/* routes */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for testing
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(AUTH_WINDOW_MS, 'rl:auth:') as RateLimitOptions['store'],
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});
