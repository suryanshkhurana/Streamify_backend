/**
 * JWT + Refresh Token utilities for the auth-service.
 *
 * Access tokens:
 *   - Short-lived JWT (default: 15 minutes)
 *   - Signed with JWT_SECRET
 *   - Payload: { sub, email, displayName }
 *   - Stored in-memory (Zustand) — never localStorage or cookies
 *
 * Refresh tokens:
 *   - UUID v4 (opaque token — not a JWT)
 *   - Long-lived (default: 7 days)
 *   - Stored as httpOnly, Secure, SameSite=Strict cookie on the client
 *   - Stored in Redis with TTL and in Postgres RefreshToken table for audit
 *   - Rotated on every /auth/refresh call
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import type { JwtPayload, TokenPair } from '@streamify/shared-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Access token lifetime in seconds (15 minutes). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 900 s

/** Refresh token lifetime in seconds (7 days). */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 604800 s

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) { throw new Error('JWT_SECRET environment variable is not set'); }
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env['JWT_REFRESH_SECRET'];
  if (!secret) { throw new Error('JWT_REFRESH_SECRET environment variable is not set'); }
  return secret;
}

// ─── Access Token ─────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;
  email: string;
  displayName: string;
}

/**
 * Signs a new JWT access token.
 *
 * @param payload - The claims to embed in the token.
 * @returns Signed JWT string.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
    },
    getJwtSecret(),
    {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: 'streamify:auth-service',
      audience: 'streamify:api',
    },
  );
}

/**
 * Verifies and decodes a JWT access token.
 * Throws `JsonWebTokenError` | `TokenExpiredError` | `NotBeforeError` on failure.
 * The `globalErrorHandler` from shared-middleware remaps these to 401 AppErrors.
 *
 * @param token - The raw JWT string (without "Bearer " prefix).
 * @returns Decoded payload.
 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret(), {
    issuer: 'streamify:auth-service',
    audience: 'streamify:api',
  }) as JwtPayload;
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

/**
 * Generates a new opaque refresh token (UUID v4).
 * The token is NOT a JWT — it is an opaque identifier looked up in Redis + Postgres.
 *
 * @returns UUID v4 string.
 */
export function generateRefreshToken(): string {
  return uuidv4();
}

/**
 * Calculates the absolute expiry Date for a refresh token.
 */
export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

// ─── Token Pair ───────────────────────────────────────────────────────────────

/**
 * Generates a complete access + refresh token pair for a user.
 *
 * @param user - Minimal user fields needed for the JWT payload.
 * @returns `{ accessToken, refreshToken }` — the refresh token is a UUID v4.
 */
export function generateTokenPair(user: {
  id: string;
  email: string;
  displayName: string;
}): TokenPair {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  });

  const refreshToken = generateRefreshToken();

  return { accessToken, refreshToken };
}

/**
 * Verifies a signed JWT used internally between services (e.g. inter-service auth).
 * Uses JWT_REFRESH_SECRET — kept separate from the public-facing JWT_SECRET.
 */
export function verifyRefreshSecret(token: string): JwtPayload {
  return jwt.verify(token, getRefreshSecret()) as JwtPayload;
}
