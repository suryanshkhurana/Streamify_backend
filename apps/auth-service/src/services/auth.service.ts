/**
 * Auth Service â€” business logic layer.
 *
 * Responsible for:
 *  - register    : Create a new user with hashed password, issue tokens
 *  - login       : Verify credentials, issue tokens
 *  - googleOAuth : Find-or-create a user from a Google profile, issue tokens
 *  - refresh     : Validate a refresh token from Redis, rotate it, issue a new pair
 *  - logout      : Revoke refresh token from Redis + Postgres, clear cookie
 *  - logoutAll   : Revoke all refresh tokens for a user (all devices)
 *
 * Token storage strategy:
 *   Access token  â†’ returned in response body (stored in-memory by the client)
 *   Refresh token â†’ stored in httpOnly cookie + Redis (TTL) + Postgres (audit)
 *
 * This layer does NOT touch Express objects (req/res) â€” that is the controller's job.
 */

import bcrypt from 'bcryptjs';
import type { Profile } from 'passport-google-oauth20';

import { AppError } from '@streamify/shared-middleware';
import { OAuthProvider } from '@streamify/shared-types';

import { prisma } from '../config/db.js';
import { getGoogleProfile } from '../config/google.js';
import { getRedis, refreshTokenKey } from '../config/redis.js';
import { publishUserRegistered } from '../events/publisher.js';
import {
  generateTokenPair,
  generateRefreshToken,
  refreshTokenExpiresAt,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../utils/tokens.js';
import type { GoogleOAuthInput, LoginInput, RegisterInput } from '../validators/auth.validators.js';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    plan: string;
  };
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Minimal user shape returned by upsertGoogleUser() and consumed by
 * createSession() and the Passport callback controller.
 */
export interface OAuthUser {
  id: string;
  email: string;
  displayName: string;
  plan: string;
}

// â”€â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BCRYPT_ROUNDS = 12;

/**
 * Stores a refresh token in Redis (fast revocation) and Postgres (audit log).
 */
async function storeRefreshToken(opts: {
  tokenId: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<void> {
  const expiresAt = refreshTokenExpiresAt();
  const redis = getRedis();

  // 1. Redis â€” primary revocation check
  await redis.set(
    refreshTokenKey(opts.userId, opts.tokenId),
    '1',
    'EX',
    REFRESH_TOKEN_TTL_SECONDS,
  );

  // 2. Postgres â€” audit trail (non-blocking in background)
  prisma.refreshToken
    .create({
      data: {
        id: opts.tokenId,
        userId: opts.userId,
        expiresAt,
        userAgent: opts.userAgent,
        ipAddress: opts.ipAddress,
      },
    })
    .catch((err: unknown) => {
      // Non-fatal â€” Redis is the primary check
      console.error('[auth] Failed to persist refresh token to Postgres', err);
    });
}

/**
 * Revokes a refresh token in both Redis and Postgres.
 */
async function revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
  const redis = getRedis();

  // Redis â€” immediate revocation
  await redis.del(refreshTokenKey(userId, tokenId));

  // Postgres â€” mark as revoked (audit trail)
  await prisma.refreshToken
    .update({
      where: { id: tokenId },
      data: { revoked: true },
    })
    .catch(() => {
      // Token may not exist in DB (e.g. test tokens) â€” safe to ignore
    });
}

// â”€â”€â”€ Service methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Register a new user with email + password.
 *
 * @throws AppError 409 if the email is already taken.
 */
export async function register(
  input: RegisterInput,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<AuthResult> {
  // 1. Check for duplicate email
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  // 2. Hash the password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // 3. Create the user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      provider: 'LOCAL',
      emailVerified: false,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      plan: true,
    },
  });

  // 4. Issue tokens
  const { accessToken, refreshToken } = generateTokenPair(user);

  // 5. Store refresh token
  await storeRefreshToken({
    tokenId: refreshToken,
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  // 6. Publish user.registered event (non-blocking)
  void publishUserRegistered({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    provider: OAuthProvider.LOCAL,
  });

  return { accessToken, refreshToken, user };
}

/**
 * Log in an existing user with email + password.
 *
 * @throws AppError 401 if credentials are invalid.
 */
export async function login(
  input: LoginInput,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<AuthResult> {
  // 1. Find user (include passwordHash for verification)
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      displayName: true,
      plan: true,
      passwordHash: true,
      isActive: true,
      provider: true,
    },
  });

  // Use a constant-time comparison pattern: always hash even if user not found
  // to prevent timing attacks from revealing whether an email exists
  const dummyHash = '$2a$12$invaliddummyhashforpreventingtimingattacks1234567890AB';
  const storedHash = user?.passwordHash ?? dummyHash;

  const passwordMatch = await bcrypt.compare(input.password, storedHash);

  if (!user) {
    throw AppError.unauthorised('User is not registered');
  }
  
  if (!passwordMatch) {
    throw AppError.unauthorised('Invalid email or password');
  }

  if (!user.isActive) {
    throw AppError.forbidden('Your account has been suspended');
  }

  if (user.provider !== 'LOCAL') {
    throw AppError.badRequest(
      `This account uses ${user.provider.toLowerCase()} login. Please sign in with ${user.provider}.`,
    );
  }

  // 2. Issue tokens
  const { accessToken, refreshToken } = generateTokenPair(user);

  // 3. Store refresh token
  await storeRefreshToken({
    tokenId: refreshToken,
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan,
    },
  };
}

/**
 * Find-or-create a user from a Google OAuth2 authorisation code.
 *
 * @throws AppError 400 if the Google profile is missing required fields.
 */
export async function googleOAuth(
  input: GoogleOAuthInput,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<AuthResult> {
  // 1. Exchange code for Google profile
  const profile = await getGoogleProfile(input.code, input.redirectUri);

  // 2. Find existing user by googleId or email
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleId: profile.googleId }, { email: profile.email }],
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      plan: true,
      googleId: true,
      isActive: true,
    },
  });


  if (!user) {
    // 3a. Create new user from Google profile
    user = await prisma.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        googleId: profile.googleId,
        provider: 'GOOGLE',
        emailVerified: profile.emailVerified,
        passwordHash: null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        googleId: true,
        isActive: true,
      },
    });
  } else if (!user.googleId) {
    // 3b. Existing email user â€” link their Google account
    await prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.googleId, emailVerified: true },
    });
  }

  if (!user.isActive) {
    throw AppError.forbidden('Your account has been suspended');
  }

  // 4. Issue tokens
  const { accessToken, refreshToken } = generateTokenPair(user);

  // 5. Store refresh token
  await storeRefreshToken({
    tokenId: refreshToken,
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  // 6. Publish user.registered unconditionally (idempotent sync for user-service)
  void publishUserRegistered({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: profile.avatarUrl,
    provider: OAuthProvider.GOOGLE,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan,
    },
  };
}

/**
 * Validate a refresh token and issue a new access + refresh token pair (rotation).
 *
 * Token rotation means the old refresh token is revoked and a new one is issued.
 * This limits the damage if a refresh token is stolen.
 *
 * @throws AppError 401 if the token is invalid, expired, or already revoked.
 */
export async function refreshTokens(
  tokenId: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<TokenRefreshResult & { user: AuthResult['user'] }> {
  const redis = getRedis();

  // 1. Look up token in Redis (fast path â€” no DB query)
  // We need userId to build the Redis key â€” look it up from Postgres first
  const dbToken = await prisma.refreshToken.findUnique({
    where: { id: tokenId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          plan: true,
          isActive: true,
        },
      },
    },
  });

  if (!dbToken || dbToken.revoked) {
    throw AppError.unauthorised('Invalid or revoked refresh token');
  }

  if (dbToken.expiresAt < new Date()) {
    throw AppError.unauthorised('Refresh token has expired');
  }

  // 2. Verify it still exists in Redis (not expired / force-revoked)
  const redisKey = refreshTokenKey(dbToken.userId, tokenId);
  const exists = await redis.exists(redisKey);

  if (!exists) {
    // Token expired in Redis â€” also revoke in Postgres for consistency
    await revokeRefreshToken(dbToken.userId, tokenId);
    throw AppError.unauthorised('Refresh token has expired');
  }

  if (!dbToken.user.isActive) {
    throw AppError.forbidden('Your account has been suspended');
  }

  // 3. Rotate â€” revoke old token, issue new pair
  await revokeRefreshToken(dbToken.userId, tokenId);

  const newRefreshToken = generateRefreshToken();
  const { accessToken } = generateTokenPair(dbToken.user);

  await storeRefreshToken({
    tokenId: newRefreshToken,
    userId: dbToken.userId,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: dbToken.user.id,
      email: dbToken.user.email,
      displayName: dbToken.user.displayName,
      plan: dbToken.user.plan,
    },
  };
}

/**
 * Log out a user from the current device.
 * Revokes the specific refresh token.
 *
 * @param tokenId - The refresh token UUID from the httpOnly cookie.
 */
export async function logout(tokenId: string): Promise<void> {
  // Find userId for the token
  const dbToken = await prisma.refreshToken.findUnique({
    where: { id: tokenId },
    select: { userId: true },
  });

  if (!dbToken) { return; } // Already revoked or doesn't exist â€” idempotent

  await revokeRefreshToken(dbToken.userId, tokenId);
}

/**
 * Log out a user from all devices.
 * Revokes all refresh tokens for the given userId.
 *
 * @param userId - The user's ID (from req.userId set by authenticate middleware).
 */
export async function logoutAll(userId: string): Promise<void> {
  const redis = getRedis();

  // 1. Find all active tokens in Postgres
  const tokens = await prisma.refreshToken.findMany({
    where: { userId, revoked: false },
    select: { id: true },
  });

  // 2. Delete all from Redis
  const pipeline = redis.pipeline();
  for (const token of tokens) {
    pipeline.del(refreshTokenKey(userId, token.id));
  }
  await pipeline.exec();

  // 3. Mark all as revoked in Postgres
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PASSPORT GOOGLE OAUTH2 â€” helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Upsert a Streamify user from a Google OAuth2 profile.
 * Called by the Passport verify callback in config/passport.ts.
 *
 * Match priority:
 *  1. googleId match â€” existing Google-linked account
 *  2. email match   â€” existing local account; links the Google ID
 *  3. neither        â€” create a new user
 *
 * @throws AppError 400 if the Google profile has no email.
 * @throws AppError 403 if the account is suspended.
 */
export async function upsertGoogleUser(profile: Profile): Promise<OAuthUser> {
  const email = profile.emails?.[0]?.value?.toLowerCase();
  if (!email) {
    throw AppError.badRequest('Google account must have a verified email address');
  }

  const googleId = profile.id;
  const displayName = profile.displayName.trim() || email.split('@')[0];
  const emailVerified = (profile.emails?.[0] as { verified?: boolean } | undefined)?.verified ?? true;

  // Find by googleId first, then fall back to email
  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
    select: {
      id: true,
      email: true,
      displayName: true,
      plan: true,
      googleId: true,
      isActive: true,
    },
  });

  if (!user) {
    // First-time Google login â€” create a new Streamify account
    user = await prisma.user.create({
      data: {
        email,
        displayName,
        googleId,
        provider: 'GOOGLE',
        emailVerified,
        passwordHash: null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        googleId: true,
        isActive: true,
      },
    });
  } else if (!user.googleId) {
    // Existing local account â€” link the Google ID
    await prisma.user.update({
      where: { id: user.id },
      data: { googleId, emailVerified: true },
    });
  }

  if (!user.isActive) {
    throw AppError.forbidden('Your account has been suspended');
  }

  // Publish event to ensure profile exists in user-service (idempotent sync)
  void publishUserRegistered({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: profile.photos?.[0]?.value,
    provider: OAuthProvider.GOOGLE,
  });

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    plan: user.plan,
  };
}

/**
 * Issue a new access + refresh token pair for a user and persist the
 * refresh token in Redis and Postgres.
 *
 * Used by the Passport callback controller so it does not need to
 * duplicate the storeRefreshToken logic.
 *
 * @param user - Minimal user fields for JWT payload.
 * @param meta - Optional request metadata for the audit log.
 */
export async function createSession(
  user: OAuthUser,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const { accessToken, refreshToken } = generateTokenPair(user);

  // Store in Redis (primary) + Postgres (audit)
  await storeRefreshToken({
    tokenId: refreshToken,
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return { accessToken, refreshToken };
}
