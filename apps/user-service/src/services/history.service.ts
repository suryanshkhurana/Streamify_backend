/**
 * History service — append and retrieve listening history.
 */

import type { TrackPlayedPayload } from '@streamify/shared-types';
import { ListeningHistory } from '../models/ListeningHistory.js';

/**
 * Append a history entry from a track.played event payload.
 * Called by the RabbitMQ consumer.
 */
export async function appendHistory(payload: TrackPlayedPayload): Promise<void> {
  await ListeningHistory.create({
    userId: payload.userId,
    trackId: payload.trackId,
    durationPlayedMs: payload.durationPlayedMs,
    completionRatio: payload.completionRatio,
    context: payload.context,
    playedAt: new Date(payload.playedAt),
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
    ListeningHistory.find({ userId })
      .sort({ playedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ListeningHistory.countDocuments({ userId }),
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
