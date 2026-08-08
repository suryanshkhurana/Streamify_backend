/**
 * Artist service — business logic for artist management.
 */

import { prisma } from '../config/db.js';
import { AppError } from '@streamify/shared-middleware';
import type { CreateArtistInput, UpdateArtistInput, ListQuery } from '../validators/catalog.validators.js';

// ─── List artists ─────────────────────────────────────────────────────────────

export async function listArtists(query: ListQuery) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [total, artists] = await Promise.all([
    prisma.artist.count(),
    prisma.artist.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tracks: true, albums: true } },
      },
    }),
  ]);

  return {
    data: artists,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Get or create artist by userId ──────────────────────────────────────────

export async function getOrCreateArtist(userId: string, name: string): Promise<{ id: string }> {
  const existing = await prisma.artist.findUnique({ where: { userId } });
  if (existing) return existing;

  let avatarUrl: string | undefined = undefined;
  try {
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:3002';
    const response = await fetch(`${userServiceUrl}/users/${userId}`);
    if (response.ok) {
      const { data } = await response.json() as any;
      if (data?.avatarUrl) {
        avatarUrl = data.avatarUrl;
      }
    }
  } catch (error) {
    // Ignore fetch errors so we don't break track creation
  }

  return prisma.artist.create({
    data: { userId, name, avatarUrl },
    select: { id: true },
  });
}

// ─── Get artist by userId ─────────────────────────────────────────────────────

export async function getArtistByUserId(userId: string) {
  const artist = await prisma.artist.findUnique({
    where: { userId },
    include: {
      albums: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { tracks: true, albums: true } },
    },
  });
  if (!artist) throw new AppError('Artist profile not found', 404);
  return artist;
}

// ─── Get artist by id ─────────────────────────────────────────────────────────

export async function getArtistById(artistId: string) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      albums: { orderBy: { releaseDate: 'desc' }, take: 10 },
      _count: { select: { tracks: true, albums: true } },
    },
  });
  if (!artist) throw new AppError('Artist not found', 404);
  return artist;
}

// ─── Create artist ────────────────────────────────────────────────────────────

export async function createArtist(userId: string, data: CreateArtistInput) {
  const existing = await prisma.artist.findUnique({ where: { userId } });
  if (existing) throw new AppError('Artist profile already exists for this account', 409);

  return prisma.artist.create({ data: { ...data, userId } });
}

// ─── Update artist ────────────────────────────────────────────────────────────

export async function updateArtist(userId: string, data: UpdateArtistInput) {
  const artist = await prisma.artist.findUnique({ where: { userId } });
  if (!artist) throw new AppError('Artist profile not found', 404);

  return prisma.artist.update({ where: { id: artist.id }, data });
}
