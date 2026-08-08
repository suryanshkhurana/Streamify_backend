/**
 * Stream controller — HTTP handlers for /stream/:trackId
 *
 * GET /stream/:trackId
 *   Returns a CloudFront-signed URL (or S3 direct URL in dev) for the
 *   HLS master playlist of the given track.
 *
 *   Requires authentication — callers must include a valid JWT.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync, AppError } from '@streamify/shared-middleware';
import { getSignedStreamUrl } from '../cloudfront/signer.js';
import { env } from '../config/env.js';
import { logger } from '@streamify/shared-middleware';

/**
 * Fetch track metadata from the catalog-service to:
 *  1. Verify the track exists
 *  2. Confirm it is in READY status
 *  3. Retrieve its hlsKey (master.m3u8 S3 path)
 */
async function getCatalogTrack(trackId: string): Promise<{ hlsKey: string; status: string; title: string }> {
  const url = `${env.catalogServiceUrl}/catalog/tracks/${trackId}`;
  const res = await fetch(url);

  if (!res.ok) {
    if (res.status === 404) throw new AppError('Track not found', 404);
    throw new AppError('Failed to fetch track metadata from catalog-service', 502);
  }

  const json = await res.json() as { success: boolean; data: { s3KeyHls?: string; status: string; title: string } };
  return {
    hlsKey: json.data.s3KeyHls ?? '',
    status: json.data.status,
    title: json.data.title,
  };
}

/**
 * GET /stream/:trackId
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "streamUrl": "https://cdn.streamify.app/hls/{trackId}/master.m3u8?...signed",
 *     "expiresInSeconds": 3600
 *   }
 * }
 */
export const getStreamUrl: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const trackId = req.params.trackId;
  // In API Gateway we attached X-User-Id, so we can parse it from headers
  // or if internal middleware set req.userId, we just cast to any.
  const userId = (req as any).userId || (req.headers['x-user-id'] as string);

  logger.info({ trackId, userId }, '[stream] resolving stream URL');

  const track = await getCatalogTrack(trackId);

  if (track.status !== 'READY') {
    throw new AppError(
      `Track is not yet ready for streaming. Current status: ${track.status}`,
      409,
    );
  }

  if (!track.hlsKey) {
    throw new AppError('Track HLS manifest not found', 404);
  }

  const expiresInSeconds = 3600; // 1 hour
  const streamUrl = getSignedStreamUrl(track.hlsKey, expiresInSeconds);

  res.json({
    success: true,
    data: {
      trackId,
      title: track.title,
      streamUrl,
      expiresInSeconds,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    },
  });
});
