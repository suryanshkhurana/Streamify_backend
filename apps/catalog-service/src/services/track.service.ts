/**
 * Track service — business logic for track management including S3 presigned URLs.
 *
 * Upload flow:
 *  1. Client calls POST /catalog/tracks        → creates a PENDING Track row + returns presigned PUT URL
 *  2. Client PUTs the audio file directly to S3
 *  3. Transcoder webhook calls PATCH /catalog/tracks/:id → sets status=READY + s3KeyHls
 *  4. track.uploaded event fires after step 1
 *  5. track.status.updated event fires after step 3
 */

import crypto from 'crypto';
import { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, S3_BUCKET } from '../config/s3.js';
import { prisma } from '../config/db.js';
import { AppError } from '@streamify/shared-middleware';
import { publishTrackUploaded, publishTrackStatusUpdated, publishTrackDeleted } from '../events/publisher.js';
import type { CreateTrackInput, UpdateTrackInput, ListQuery } from '../validators/catalog.validators.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Presigned URL expiry — 15 minutes */
const PRESIGNED_EXPIRES_IN = 900;

// ─── List tracks ──────────────────────────────────────────────────────────────

export async function listTracks(query: ListQuery) {
  const { page, limit, status, genre, ids, artistId, sort } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(status ? { status } : { status: 'READY' as const }),
    ...(genre ? { genres: { has: genre } } : {}),
    ...(ids ? { id: { in: ids.split(',') } } : {}),
    ...(artistId ? { artistId } : {}),
  };

  const orderBy = sort === 'popular' ? { playCount: 'desc' as const } : { createdAt: 'desc' as const };

  const [tracks, total] = await prisma.$transaction([
    prisma.track.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        artist: { select: { id: true, name: true, avatarUrl: true } },
        album: { select: { id: true, title: true, coverUrl: true } },
      },
    }),
    prisma.track.count({ where }),
  ]);

  return { tracks, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Get track by id ──────────────────────────────────────────────────────────

export async function getTrackById(trackId: string) {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: {
      artist: { select: { id: true, name: true, avatarUrl: true } },
      album: { select: { id: true, title: true, coverUrl: true } },
    },
  });
  if (!track) throw new AppError('Track not found', 404);
  return track;
}

// ─── Create track + generate presigned URL ────────────────────────────────────

export async function createTrack(
  artistId: string,
  data: CreateTrackInput,
): Promise<{ track: Awaited<ReturnType<typeof prisma.track.create>>; uploadUrl: string }> {
  // Verify album belongs to this artist (if provided)
  if (data.albumId) {
    const album = await prisma.album.findUnique({ where: { id: data.albumId } });
    if (!album) throw new AppError('Album not found', 404);
    if (album.artistId !== artistId) throw new AppError('Album does not belong to your artist profile', 403);
  }

  // Generate a unique S3 key: artists/<artistId>/tracks/<uuid>.<ext>
  const ext = data.mimeType === 'audio/flac' ? 'flac'
    : data.mimeType === 'audio/wav' ? 'wav'
    : data.mimeType === 'audio/ogg' ? 'ogg'
    : 'mp3';
  const s3Key = `artists/${artistId}/tracks/${crypto.randomUUID()}.${ext}`;

  // Create the PENDING track row first
  const track = await prisma.track.create({
    data: {
      title: data.title,
      artistId,
      albumId: data.albumId ?? null,
      trackNumber: data.trackNumber ?? null,
      genres: data.genres,
      isExplicit: data.isExplicit,
      coverUrl: data.coverUrl ?? null,
      s3Key,
      status: 'PENDING',
    },
  });

  // Generate presigned PUT URL (15-minute expiry)
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    ContentType: data.mimeType,
    ...(data.fileSizeBytes ? { ContentLength: data.fileSizeBytes } : {}),
    Metadata: {
      trackId: track.id,
      artistId,
      title: data.title,
    },
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGNED_EXPIRES_IN });

  // We do NOT fire the event here. The client must call upload-complete after S3 PUT.
  return { track, uploadUrl };
}

// ─── Mark upload complete (fires transcoding event) ───────────────────────────

export async function markUploadComplete(trackId: string, artistId: string): Promise<void> {
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) throw new AppError('Track not found', 404);
  if (track.artistId !== artistId) throw new AppError('Forbidden', 403);
  if (track.status !== 'PENDING') throw new AppError('Track is already processed', 400);

  // Fire track.uploaded event (non-blocking)
  publishTrackUploaded({
    trackId: track.id,
    artistId: track.artistId,
    albumId: track.albumId,
    title: track.title,
    genres: track.genres,
    s3Key: track.s3Key!, // S3 key is always set during creation
    uploadedAt: new Date().toISOString(),
  });
}

// ─── Update track (status webhook + metadata patch) ───────────────────────────

export async function updateTrack(
  trackId: string,
  artistId: string,
  data: UpdateTrackInput,
) {
  const existing = await prisma.track.findUnique({ where: { id: trackId } });
  if (!existing) throw new AppError('Track not found', 404);
  if (existing.artistId !== artistId) throw new AppError('Forbidden', 403);

  const updated = await prisma.track.update({
    where: { id: trackId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.albumId !== undefined ? { albumId: data.albumId } : {}),
      ...(data.trackNumber !== undefined ? { trackNumber: data.trackNumber } : {}),
      ...(data.genres !== undefined ? { genres: data.genres } : {}),
      ...(data.isExplicit !== undefined ? { isExplicit: data.isExplicit } : {}),
      ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.s3KeyHls !== undefined ? { s3KeyHls: data.s3KeyHls } : {}),
      ...(data.durationMs !== undefined ? { durationMs: data.durationMs } : {}),
    },
  });

  // Emit status update event when track transitions to READY or FAILED
  if (data.status === 'READY' || data.status === 'FAILED') {
    publishTrackStatusUpdated({
      trackId: updated.id,
      artistId: updated.artistId,
      status: updated.status,
      ...(data.s3KeyHls ? { s3KeyHls: data.s3KeyHls } : {}),
    });
  }

  return updated;
}

// ─── Delete track ─────────────────────────────────────────────────────────────

export async function deleteTrack(trackId: string, artistId: string): Promise<void> {
  const existing = await prisma.track.findUnique({ where: { id: trackId } });
  if (!existing) throw new AppError('Track not found', 404);
  if (existing.artistId !== artistId) throw new AppError('Forbidden', 403);

  try {
    if (existing.s3Key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: existing.s3Key,
      }));
    }

    if (existing.s3KeyHls) {
      const prefix = existing.s3KeyHls.substring(0, existing.s3KeyHls.lastIndexOf('/') + 1);
      if (prefix) {
        let isTruncated = true;
        let continuationToken: string | undefined = undefined;

        while (isTruncated) {
          const listRes: any = await s3.send(new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }));

          if (listRes.Contents && listRes.Contents.length > 0) {
            await s3.send(new DeleteObjectsCommand({
              Bucket: S3_BUCKET,
              Delete: {
                Objects: listRes.Contents.map((c: any) => ({ Key: c.Key })),
              },
            }));
          }
          isTruncated = listRes.IsTruncated ?? false;
          continuationToken = listRes.NextContinuationToken;
        }
      }
    }
  } catch (err) {
    console.error(`[deleteTrack] Failed to delete S3 objects for track ${trackId}:`, err);
  }

  await prisma.track.delete({ where: { id: trackId } });
  publishTrackDeleted({ trackId });
}

// ─── Increment play count ─────────────────────────────────────────────────────

export async function incrementPlayCount(trackId: string): Promise<void> {
  await prisma.track.update({
    where: { id: trackId },
    data: { playCount: { increment: 1 } },
  });
}
