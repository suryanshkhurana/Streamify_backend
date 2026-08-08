/**
 * src/validators/playlist.validators.ts
 *
 * Zod schemas for every incoming request body / query used by the
 * playlist-service. Keeps controllers thin and types correct.
 */

import { z } from 'zod';

// ─── Create Playlist ──────────────────────────────────────────────────────────

export const createPlaylistSchema = z.object({
  name:             z.string().min(1).max(100),
  description:      z.string().max(500).optional().default(''),
  coverUrl:         z.string().url().or(z.literal('')).optional().default(''),
  visibility:       z.enum(['public', 'private', 'unlisted']).optional().default('private'),
  collaborators:    z.array(z.string()).optional().default([]),
});

export type CreatePlaylistDto = z.infer<typeof createPlaylistSchema>;

// ─── Update Playlist ──────────────────────────────────────────────────────────

export const updatePlaylistSchema = z.object({
  name:             z.string().min(1).max(100).optional(),
  description:      z.string().max(500).optional(),
  coverUrl:         z.string().url().or(z.literal('')).optional(),
  visibility:       z.enum(['public', 'private', 'unlisted']).optional(),
  collaborators:    z.array(z.string()).optional(),
});

export type UpdatePlaylistDto = z.infer<typeof updatePlaylistSchema>;

// ─── Add Tracks ───────────────────────────────────────────────────────────────

export const addTracksSchema = z.object({
  // Accept a single trackId string OR an array of trackId strings
  trackIds: z
    .union([z.string(), z.array(z.string()).min(1)])
    .transform((v) => (typeof v === 'string' ? [v] : v)),
});

export type AddTracksDto = z.infer<typeof addTracksSchema>;

// ─── Reorder Tracks ───────────────────────────────────────────────────────────

export const reorderTracksSchema = z.object({
  // Full ordered list of trackIds — positions are inferred by array index
  trackIds: z.array(z.string()).min(1),
});

export type ReorderTracksDto = z.infer<typeof reorderTracksSchema>;

// ─── Add Collaborator ─────────────────────────────────────────────────────────

export const addCollaboratorSchema = z.object({
  userId: z.string().min(1),
});

export type AddCollaboratorDto = z.infer<typeof addCollaboratorSchema>;

// ─── List Playlists Query ─────────────────────────────────────────────────────

export const listPlaylistsQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(20),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
});

export type ListPlaylistsQuery = z.infer<typeof listPlaylistsQuerySchema>;
