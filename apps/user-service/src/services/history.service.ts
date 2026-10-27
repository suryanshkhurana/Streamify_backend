/**
 * History service — append and retrieve listening history.
 */

import type { TrackPlayedPayload } from '@streamify/shared-types';
import { prisma } from '../config/prisma.js';

/**
 * Append a history entry from a track.played event payload.
 * Called by the RabbitMQ consumer.
 */
export async function appendHistory(payload: TrackPlayedPayload): Promise<void> {
  await prisma.listeningHistory.create({
    data: {
      userId: payload.userId,
      trackId: payload.trackId,
      durationPlayedMs: payload.durationPlayedMs,
      completionRatio: payload.completionRatio,
      context: payload.context as unknown as string,
      playedAt: new Date(payload.playedAt),
    }
  });
}

/**
 * GET /users/me/history — paginated listening history for the calling user.
 */
export async function getMyHistory(
  userId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    prisma.listeningHistory.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.listeningHistory.count({
      where: { userId },
    }),
  ]);

  return {
    data: entries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}
