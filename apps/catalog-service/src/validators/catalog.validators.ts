/**
 * Zod validators for catalog-service request bodies.
 */

import { z } from 'zod';

// ─── Artist ───────────────────────────────────────────────────────────────────

export const createArtistSchema = z.object({
  name: z.string().min(1).max(200),
  bio: z.string().max(2000).optional(),
  avatarUrl: z.string().url().optional(),
  country: z.string().length(2).optional(), // ISO 3166-1 alpha-2
  genres: z.array(z.string()).max(10).default([]),
});

export const updateArtistSchema = createArtistSchema.partial();

export type CreateArtistInput = z.infer<typeof createArtistSchema>;
export type UpdateArtistInput = z.infer<typeof updateArtistSchema>;

// ─── Album ────────────────────────────────────────────────────────────────────

export const createAlbumSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.enum(['ALBUM', 'EP', 'SINGLE']).default('ALBUM'),
  coverUrl: z.string().url().optional(),
  releaseDate: z.string().datetime().optional(),
  genres: z.array(z.string()).max(10).default([]),
  isExplicit: z.boolean().default(false),
});

export const updateAlbumSchema = createAlbumSchema.partial();

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;

// ─── Track ────────────────────────────────────────────────────────────────────

export const createTrackSchema = z.object({
  title: z.string().min(1).max(300),
  albumId: z.string().uuid().optional(),
  trackNumber: z.number().int().positive().optional(),
  genres: z.array(z.string()).max(10).default([]),
  isExplicit: z.boolean().default(false),
  coverUrl: z.string().url().optional(),
  /// MIME type of the file the client will upload (used to set ContentType on the presigned URL)
  mimeType: z.enum(['audio/mpeg', 'audio/flac', 'audio/wav', 'audio/ogg']).default('audio/mpeg'),
  /// Original file size in bytes — used for S3 content-length check
  fileSizeBytes: z.number().int().positive().optional(),
});

export const updateTrackSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  albumId: z.string().uuid().nullable().optional(),
  trackNumber: z.number().int().positive().optional(),
  genres: z.array(z.string()).max(10).optional(),
  isExplicit: z.boolean().optional(),
  coverUrl: z.string().url().optional(),
  /// Patch for status after transcoding webhook callback
  status: z.enum(['PROCESSING', 'READY', 'FAILED']).optional(),
  s3KeyHls: z.string().optional(),
  durationMs: z.number().int().positive().optional(),
});

export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;

// ─── Query params ─────────────────────────────────────────────────────────────

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']).optional(),
  genre: z.string().optional(),
  ids: z.string().optional(),
  artistId: z.string().optional(),
  sort: z.enum(['popular', 'recent']).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
