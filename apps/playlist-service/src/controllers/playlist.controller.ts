/**
 * src/controllers/playlist.controller.ts
 *
 * All business logic for the playlist-service.
 * Explicit RequestHandler types on every export fix TS2742.
 */

import type { Request, Response, RequestHandler } from 'express';
import { AppError, catchAsync } from '@streamify/shared-middleware';
import { Playlist, type IPlaylist } from '../models/playlist.model.js';
import type {
  CreatePlaylistDto,
  UpdatePlaylistDto,
  AddTracksDto,
  ReorderTracksDto,
  AddCollaboratorDto,
  ListPlaylistsQuery,
} from '../validators/playlist.validators.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPage(query: unknown): ListPlaylistsQuery {
  return query as ListPlaylistsQuery;
}

// Normalize track positions so they are 0-indexed and contiguous
function normalizePositions(playlist: IPlaylist): void {
  playlist.tracks.sort((a, b) => a.position - b.position);
  playlist.tracks.forEach((t, i) => {
    t.position = i;
  });
}

// ─── Featured playlists (static seed) ────────────────────────────────────────

const FEATURED: Array<{
  id: string;
  name: string;
  description: string;
  coverUrl: string;
}> = [
  {
    id: 'featured-top-hits',
    name: 'Top Hits 2024',
    description: 'The biggest songs right now',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400',
  },
  {
    id: 'featured-chill-vibes',
    name: 'Chill Vibes',
    description: 'Relax and unwind',
    coverUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400',
  },
  {
    id: 'featured-workout',
    name: 'Workout Beats',
    description: 'High energy tracks to power your session',
    coverUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400',
  },
  {
    id: 'featured-focus',
    name: 'Deep Focus',
    description: 'Music for concentration and flow',
    coverUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400',
  },
];

// ─── GET /playlists/featured ──────────────────────────────────────────────────

export const getFeatured: RequestHandler = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: FEATURED });
  },
);

// ─── GET /playlists ───────────────────────────────────────────────────────────

export const listMyPlaylists: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, visibility } = toPage(req.query);

    const filter: Record<string, unknown> = { ownerId: req.userId };
    if (visibility) filter['visibility'] = visibility;

    const total = await Playlist.countDocuments(filter);
    const playlists = await Playlist.find(filter)
      .select('-tracks')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: playlists,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

// ─── GET /playlists/public ────────────────────────────────────────────────────

export const listPublicPlaylists: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = toPage(req.query);

    const filter = { visibility: 'public' };
    const total = await Playlist.countDocuments(filter);
    const playlists = await Playlist.find(filter)
      .select('-tracks')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: playlists,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

// ─── POST /playlists ──────────────────────────────────────────────────────────

export const createPlaylist: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as CreatePlaylistDto;

    const playlist = await Playlist.create({
      ownerId:       req.userId,
      name:          body.name,
      description:   body.description ?? '',
      coverUrl:      body.coverUrl ?? '',
      visibility:    body.visibility ?? 'private',
      collaborators: body.collaborators ?? [],
      tracks:        [],
    });

    res.status(201).json({ success: true, data: playlist });
  },
);

// ─── GET /playlists/:id ───────────────────────────────────────────────────────

export const getPlaylist: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.userId;

    const playlist = await Playlist.findById(id);

    if (!playlist) {
      throw AppError.notFound(`Playlist ${id} not found`);
    }

    if (playlist.visibility === 'private') {
      const canView =
        userId &&
        (playlist.ownerId === userId ||
          playlist.collaborators.includes(userId));

      if (!canView) {
        throw AppError.forbidden('This playlist is private');
      }
    }

    playlist.tracks.sort((a, b) => a.position - b.position);

    res.json({ success: true, data: playlist });
  },
);

// ─── PATCH /playlists/:id ─────────────────────────────────────────────────────

export const updatePlaylist: RequestHandler = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;
    const body = _req.body as UpdatePlaylistDto;

    if (body.name          !== undefined) playlist.name          = body.name;
    if (body.description   !== undefined) playlist.description   = body.description;
    if (body.coverUrl      !== undefined) playlist.coverUrl      = body.coverUrl;
    if (body.visibility    !== undefined) playlist.visibility    = body.visibility;
    if (body.collaborators !== undefined) playlist.collaborators = body.collaborators;

    await playlist.save();

    res.json({ success: true, data: playlist });
  },
);

// ─── DELETE /playlists/:id ────────────────────────────────────────────────────

export const deletePlaylist: RequestHandler = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;

    if (playlist.isSystemPlaylist) {
      throw AppError.forbidden('System playlists cannot be deleted');
    }

    await playlist.deleteOne();

    res.status(204).send();
  },
);

// ─── POST /playlists/:id/tracks ───────────────────────────────────────────────

export const addTracks: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;
    const { trackIds } = req.body as AddTracksDto;
    const userId = req.userId!;

    const existingIds = new Set(playlist.tracks.map((t) => t.trackId));
    let nextPosition = playlist.tracks.length;

    for (const trackId of trackIds) {
      if (existingIds.has(trackId)) continue;

      playlist.tracks.push({
        trackId,
        addedBy:  userId,
        position: nextPosition++,
        addedAt:  new Date(),
      });

      existingIds.add(trackId);
    }

    await playlist.save();

    res.json({ success: true, data: playlist });
  },
);

// ─── DELETE /playlists/:id/tracks/:trackId ────────────────────────────────────

export const removeTrack: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;
    const { trackId } = req.params;

    const before = playlist.tracks.length;
    playlist.tracks = playlist.tracks.filter((t) => t.trackId !== trackId);

    if (playlist.tracks.length === before) {
      throw AppError.notFound(`Track ${trackId} is not in this playlist`);
    }

    normalizePositions(playlist);

    await playlist.save();

    res.json({ success: true, data: playlist });
  },
);

// ─── PUT /playlists/:id/tracks/reorder ───────────────────────────────────────

export const reorderTracks: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;
    const { trackIds } = req.body as ReorderTracksDto;

    const positionMap = new Map<string, number>();
    trackIds.forEach((id, idx) => positionMap.set(id, idx));

    const playlistTrackIds = new Set(playlist.tracks.map((t) => t.trackId));
    for (const id of trackIds) {
      if (!playlistTrackIds.has(id)) {
        throw AppError.badRequest(`Track ${id} is not in this playlist`);
      }
    }

    playlist.tracks.forEach((t) => {
      const newPos = positionMap.get(t.trackId);
      if (newPos !== undefined) {
        t.position = newPos;
      }
    });

    playlist.tracks.sort((a, b) => a.position - b.position);

    await playlist.save();

    res.json({ success: true, data: playlist });
  },
);

// ─── POST /playlists/:id/collaborators ───────────────────────────────────────

export const addCollaborator: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;
    const { userId } = req.body as AddCollaboratorDto;

    if (playlist.ownerId === userId) {
      throw AppError.badRequest('Owner cannot be added as a collaborator');
    }

    if (!playlist.collaborators.includes(userId)) {
      playlist.collaborators.push(userId);
      await playlist.save();
    }

    res.json({ success: true, data: playlist });
  },
);

// ─── DELETE /playlists/:id/collaborators/:userId ─────────────────────────────

export const removeCollaborator: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as IPlaylist;
    const { userId } = req.params;

    playlist.collaborators = playlist.collaborators.filter((c) => c !== userId);
    await playlist.save();

    res.json({ success: true, data: playlist });
  },
);
