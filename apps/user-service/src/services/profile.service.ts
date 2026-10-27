/**
 * Profile service — all business logic for profile CRUD.
 *
 * Redis caching strategy:
 *   GET  /users/:id  → read cache first (10 min TTL), fallback to Postgres
 *   PUT  /users/me   → update Postgres, then delete cache (invalidation)
 */

import type { UpdateProfileInput, UpdatePreferencesInput } from '../validators/user.validators.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '@streamify/shared-middleware';
import {
  redis,
  profileCacheKey,
  PROFILE_CACHE_TTL_SECONDS,
} from '../config/redis.js';
import { logger } from '@streamify/shared-middleware';


// ─── Helpers ─────────────────────────────────────────────────────────────────

function toPublicProfile(doc: any) {
  return {
    id: doc.id,
    authId: doc.authId,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl,
    country: doc.country,
    bio: doc.bio,
    followerCount: doc.followerCount,
    followingCount: doc.followingCount,
    isVerifiedArtist: doc.isVerifiedArtist,
    createdAt: doc.createdAt,
  };
}

function toFullProfile(doc: any) {
  return {
    ...toPublicProfile(doc),
    email: doc.email,
    provider: doc.provider,
    preferences: {
      audioQuality: doc.audioQuality,
      explicitContent: doc.explicitContent,
      language: doc.language,
      emailNotifications: doc.emailNotifications,
      pushNotifications: doc.pushNotifications,
      preferredGenres: doc.preferredGenres,
    },
    updatedAt: doc.updatedAt,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * GET /users/me — return the calling user's full profile.
 */
export async function getMyProfile(authId: string) {
  const doc = await prisma.profile.findUnique({ where: { authId } });
  if (!doc) throw AppError.notFound('Profile not found');
  return toFullProfile(doc);
}

/**
 * GET /users/:id — return a user's public profile.
 * Results cached in Redis for 10 minutes.
 */
export async function getPublicProfile(authId: string) {
  const cacheKey = profileCacheKey(authId);

  // ── 1. Cache hit ───────────────────────────────────────────────────────────
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ authId }, '[profile] cache hit');
      return JSON.parse(cached) as ReturnType<typeof toPublicProfile>;
    }
  } catch (err) {
    logger.warn({ err }, '[profile] Redis read error — falling back to Postgres');
  }

  // ── 2. Postgres fallback ──────────────────────────────────────────────────────
  const doc = await prisma.profile.findUnique({ where: { authId } });
  if (!doc) throw AppError.notFound('User not found');

  const profile = toPublicProfile(doc);

  // ── 3. Populate cache ─────────────────────────────────────────────────────
  try {
    await redis.setex(cacheKey, PROFILE_CACHE_TTL_SECONDS, JSON.stringify(profile));
  } catch (err) {
    logger.warn({ err }, '[profile] Redis write error — cache not populated');
  }

  return profile;
}

/**
 * PUT /users/me — update display name, country, bio.
 * Invalidates the Redis cache so the next GET fetches fresh data.
 */
export async function updateMyProfile(authId: string, input: UpdateProfileInput) {
  let doc;
  try {
    doc = await prisma.profile.update({
      where: { authId },
      data: input,
    });
  } catch (error) {
    throw AppError.notFound('Profile not found');
  }

  // Invalidate cache
  try {
    await redis.del(profileCacheKey(authId));
  } catch (err) {
    logger.warn({ err }, '[profile] failed to invalidate cache');
  }

  return toFullProfile(doc);
}

/**
 * PUT /users/me/preferences — replace preference fields (partial update).
 */
export async function updateMyPreferences(
  authId: string,
  input: UpdatePreferencesInput,
) {
  let doc;
  try {
    doc = await prisma.profile.update({
      where: { authId },
      data: input as any, // TypeScript needs help since keys match directly on model
    });
  } catch (error) {
    throw AppError.notFound('Profile not found');
  }

  return toFullProfile(doc).preferences;
}

/**
 * Upsert a profile from a user.registered event payload.
 * Called by the RabbitMQ consumer.
 */
export async function upsertProfileFromEvent(payload: {
  authId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  provider: string;
}) {
  await prisma.profile.upsert({
    where: { authId: payload.authId },
    update: {}, // Only insert if missing
    create: {
      authId: payload.authId,
      email: payload.email,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      provider: payload.provider,
    },
  });
}
