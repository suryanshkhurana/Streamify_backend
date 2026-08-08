/**
 * Album service — business logic for album management.
 */

import { prisma } from '../config/db.js';
import { AppError } from '@streamify/shared-middleware';
import type { CreateAlbumInput, UpdateAlbumInput, ListQuery } from '../validators/catalog.validators.js';

// ─── List albums ──────────────────────────────────────────────────────────────

export async function listAlbums(query: ListQuery) {
  const { page, limit, artistId } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(artistId ? { artistId } : {}),
  };

  const [albums, total] = await prisma.$transaction([
    prisma.album.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        artist: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { tracks: true } },
      },
    }),
    prisma.album.count({ where }),
  ]);

  return { albums, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Get album by id ──────────────────────────────────────────────────────────

export async function getAlbumById(albumId: string) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      artist: { select: { id: true, name: true, avatarUrl: true } },
      tracks: {
        where: { status: 'READY' },
        orderBy: { trackNumber: 'asc' },
      },
    },
  });
  if (!album) throw new AppError('Album not found', 404);
  return album;
}

// ─── Create album ─────────────────────────────────────────────────────────────

export async function createAlbum(artistId: string, data: CreateAlbumInput) {
  return prisma.album.create({
    data: {
      ...data,
      artistId,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
    },
  });
}

// ─── Update album ─────────────────────────────────────────────────────────────

export async function updateAlbum(albumId: string, artistId: string, data: UpdateAlbumInput) {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) throw new AppError('Album not found', 404);
  if (album.artistId !== artistId) throw new AppError('Forbidden', 403);

  return prisma.album.update({
    where: { id: albumId },
    data: {
      ...data,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
    },
  });
}

// ─── Delete album ─────────────────────────────────────────────────────────────

export async function deleteAlbum(albumId: string, artistId: string): Promise<void> {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) throw new AppError('Album not found', 404);
  if (album.artistId !== artistId) throw new AppError('Forbidden', 403);

  await prisma.album.delete({ where: { id: albumId } });
}
