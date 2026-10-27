/**
 * src/controllers/playlist.controller.ts
 *
 * All business logic for the playlist-service.
 * Explicit RequestHandler types on every export fix TS2742.
 */

import type { Request, Response, RequestHandler } from 'express';
import { AppError, catchAsync } from '@streamify/shared-middleware';
import { prisma } from '../config/prisma.js';
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
    const { page = 1, limit = 20, visibility } = toPage(req.query);
    const skip = (page - 1) * limit;

    const where: any = { ownerId: req.userId };
    if (visibility) where.isPublic = visibility === 'public';

    const [total, playlists] = await Promise.all([
      prisma.playlist.count({ where }),
      prisma.playlist.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: playlists.map(p => ({ ...p, visibility: p.isPublic ? 'public' : 'private' })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

// ─── GET /playlists/public ────────────────────────────────────────────────────

export const listPublicPlaylists: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { page = 1, limit = 20 } = toPage(req.query);
    const skip = (page - 1) * limit;

    const where = { isPublic: true };
    const [total, playlists] = await Promise.all([
      prisma.playlist.count({ where }),
      prisma.playlist.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: playlists.map(p => ({ ...p, visibility: 'public' })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

// ─── POST /playlists ──────────────────────────────────────────────────────────

export const createPlaylist: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as CreatePlaylistDto;

    const playlist = await prisma.playlist.create({
      data: {
        ownerId:       req.userId!,
        title:         body.name, // Prisma schema uses title!
        description:   body.description ?? '',
        isPublic:      body.visibility !== 'private',
        collaborators: body.collaborators ?? [],
        tracks:        [],
      },
    });

    res.status(201).json({ success: true, data: { ...playlist, visibility: playlist.isPublic ? 'public' : 'private', name: playlist.title } });
  },
);

// ─── GET /playlists/:id ───────────────────────────────────────────────────────

export const getPlaylist: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.userId;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
    });

    if (!playlist) {
      throw AppError.notFound(`Playlist ${id} not found`);
    }

    if (!playlist.isPublic) {
      const canView =
        userId &&
        (playlist.ownerId === userId ||
          playlist.collaborators.includes(userId));

      if (!canView) {
        throw AppError.forbidden('This playlist is private');
      }
    }

    res.json({ success: true, data: { ...playlist, visibility: playlist.isPublic ? 'public' : 'private', name: playlist.title } });
  },
);

// ─── PATCH /playlists/:id ─────────────────────────────────────────────────────

export const updatePlaylist: RequestHandler = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    // Note: The original middleware `requireOwnerOrCollaborator` attached `playlist` to res.locals
    const playlistId = (res.locals['playlist'] as any).id;
    const body = _req.body as UpdatePlaylistDto;

    const updateData: any = {};
    if (body.name          !== undefined) updateData.title         = body.name;
    if (body.description   !== undefined) updateData.description   = body.description;
    if (body.visibility    !== undefined) updateData.isPublic      = body.visibility === 'public';
    if (body.collaborators !== undefined) updateData.collaborators = body.collaborators;

    const updated = await prisma.playlist.update({
      where: { id: playlistId },
      data: updateData,
    });

    res.json({ success: true, data: { ...updated, visibility: updated.isPublic ? 'public' : 'private', name: updated.title } });
  },
);

// ─── DELETE /playlists/:id ────────────────────────────────────────────────────

export const deletePlaylist: RequestHandler = catchAsync(
  async (_req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as any;

    if (playlist.title === 'Favorites') {
      throw AppError.forbidden('System playlists cannot be deleted');
    }

    await prisma.playlist.delete({
      where: { id: playlist.id },
    });

    res.status(204).send();
  },
);

// ─── POST /playlists/:id/tracks ───────────────────────────────────────────────

export const addTracks: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as any;
    const { trackIds } = req.body as AddTracksDto;

    const existingIds = new Set(playlist.tracks);
    const newTracksData = [...playlist.tracks];
    for (const trackId of trackIds) {
      if (existingIds.has(trackId)) continue;
      newTracksData.push(trackId);
      existingIds.add(trackId);
    }

    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlist.id },
      data: { tracks: newTracksData },
    });

    res.json({ success: true, data: { ...updatedPlaylist, visibility: updatedPlaylist.isPublic ? 'public' : 'private', name: updatedPlaylist.title } });
  },
);

// ─── DELETE /playlists/:id/tracks/:trackId ────────────────────────────────────

export const removeTrack: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as any;
    const { trackId } = req.params;

    if (!playlist.tracks.includes(trackId)) {
      throw AppError.notFound(`Track ${trackId} is not in this playlist`);
    }

    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlist.id },
      data: { tracks: playlist.tracks.filter((t: string) => t !== trackId) },
    });

    res.json({ success: true, data: { ...updatedPlaylist, visibility: updatedPlaylist.isPublic ? 'public' : 'private', name: updatedPlaylist.title } });
  },
);

// ─── PUT /playlists/:id/tracks/reorder ───────────────────────────────────────

export const reorderTracks: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as any;
    const { trackIds } = req.body as ReorderTracksDto;

    const playlistTrackIds = new Set(playlist.tracks);
    for (const id of trackIds) {
      if (!playlistTrackIds.has(id)) {
        throw AppError.badRequest(`Track ${id} is not in this playlist`);
      }
    }

    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlist.id },
      data: { tracks: trackIds },
    });

    res.json({ success: true, data: { ...updatedPlaylist, visibility: updatedPlaylist.isPublic ? 'public' : 'private', name: updatedPlaylist.title } });
  },
);

// ─── POST /playlists/:id/collaborators ───────────────────────────────────────

export const addCollaborator: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as any;
    const { userId } = req.body as AddCollaboratorDto;

    if (playlist.ownerId === userId) {
      throw AppError.badRequest('Owner cannot be added as a collaborator');
    }

    let updatedPlaylist = playlist;
    if (!playlist.collaborators.includes(userId)) {
      updatedPlaylist = await prisma.playlist.update({
        where: { id: playlist.id },
        data: {
          collaborators: [...playlist.collaborators, userId]
        }
      });
    }

    res.json({ success: true, data: { ...updatedPlaylist, visibility: updatedPlaylist.isPublic ? 'public' : 'private', name: updatedPlaylist.title } });
  },
);

// ─── DELETE /playlists/:id/collaborators/:userId ─────────────────────────────

export const removeCollaborator: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const playlist = res.locals['playlist'] as any;
    const { userId } = req.params;

    const newCollaborators = playlist.collaborators.filter((c: any) => c !== userId);

    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlist.id },
      data: {
        collaborators: newCollaborators
      },
    });

    res.json({ success: true, data: { ...updatedPlaylist, visibility: updatedPlaylist.isPublic ? 'public' : 'private', name: updatedPlaylist.title } });
  },
);
