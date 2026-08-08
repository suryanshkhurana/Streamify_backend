/**
 * Zod validators for the user-service routes.
 */

import { z } from 'zod';

// ─── Profile update ───────────────────────────────────────────────────────────

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .min(1)
      .max(50)
      .optional(),
    country: z
      .string()
      .length(2, 'Country must be a 2-letter ISO 3166-1 alpha-2 code')
      .toUpperCase()
      .optional(),
    bio: z.string().max(300).optional(),
    avatarUrl: z.string().url().optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Preferences update ───────────────────────────────────────────────────────

export const updatePreferencesSchema = z
  .object({
    audioQuality: z.enum(['LOW', 'NORMAL', 'HIGH', 'LOSSLESS']).optional(),
    explicitContent: z.boolean().optional(),
    language: z.string().min(2).max(10).optional(),
    emailNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    preferredGenres: z.array(z.string()).max(20).optional(),
  })
  .strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// ─── Follow ───────────────────────────────────────────────────────────────────

export const followSchema = z.object({
  targetType: z.enum(['USER', 'ARTIST']),
});

export type FollowInput = z.infer<typeof followSchema>;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
