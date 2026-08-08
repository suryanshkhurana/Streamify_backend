/**
 * Zod validation schemas for all auth-service request bodies.
 *
 * These are the single source of truth for request validation.
 * The `validate` middleware from @streamify/shared-middleware uses these
 * schemas to parse and coerce request bodies before they reach controllers.
 */

import { z } from 'zod';

// ─── Register ─────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    ),
  displayName: z
    .string({ required_error: 'Display name is required' })
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must not exceed 50 characters')
    .trim(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export const GoogleOAuthSchema = z.object({
  code: z
    .string({ required_error: 'Authorization code is required' })
    .min(1, 'Authorization code is required'),
  redirectUri: z
    .string({ required_error: 'Redirect URI is required' })
    .min(1, 'Redirect URI is required'),
});

export type GoogleOAuthInput = z.infer<typeof GoogleOAuthSchema>;

// ─── Refresh token (cookie — validated separately) ────────────────────────────

/** Validates the raw refreshToken string extracted from the httpOnly cookie. */
export const RefreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'Refresh token cookie is missing' })
    .uuid('Invalid refresh token format'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
