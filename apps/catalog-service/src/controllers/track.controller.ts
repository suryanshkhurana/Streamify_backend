/**
 * Track controller — HTTP handlers for /catalog/tracks endpoints.
 *
 * The most important endpoint is POST /catalog/tracks which:
 *  1. Creates a PENDING track record in Postgres
 *  2. Returns a presigned S3 PUT URL for the client to upload the audio file
 *  3. Publishes a track.uploaded RabbitMQ event
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import * as trackService from '../services/track.service.js';
import * as artistService from '../services/artist.service.js';
import type { CreateTrackInput, UpdateTrackInput, ListQuery } from '../validators/catalog.validators.js';

/** GET /catalog/tracks — list tracks (paginated, filterable by status and genre) */
export const listTracks: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as ListQuery;
  const result = await trackService.listTracks(query);
  res.json({ success: true, ...result });
});

/** GET /catalog/tracks/:trackId — get a single track */
export const getTrack: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { trackId } = req.params as { trackId: string };
  const track = await trackService.getTrackById(trackId);
  res.json({ success: true, data: track });
});

/**
 * POST /catalog/tracks
 *
 * Creates a PENDING track record + returns a presigned S3 PUT URL.
 * The client must immediately PUT the audio file to the returned uploadUrl.
 *
 * Response shape:
 * {
 *   "success": true,
 *   "data": { "track": { ... }, "uploadUrl": "https://s3.amazonaws.com/..." }
 * }
 */
export const createTrack: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId || (req.headers['x-user-id'] as string);
  const input = req.body as CreateTrackInput;

  // Resolve userId → artistId (auto-creates artist profile if first upload)
  const artist = await artistService.getOrCreateArtist(userId, 'Unknown Artist');
  const { track, uploadUrl } = await trackService.createTrack(artist.id, input);

  res.status(201).json({
    success: true,
    data: { track, uploadUrl },
    message: 'Track created. Upload audio file to uploadUrl within 15 minutes, then call POST /tracks/:trackId/upload-complete',
  });
});

/** POST /catalog/tracks/:trackId/upload-complete — signal that S3 upload is finished */
export const completeTrackUpload: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId || (req.headers['x-user-id'] as string);
  const { trackId } = req.params as { trackId: string };

  const artist = await artistService.getArtistByUserId(userId);
  await trackService.markUploadComplete(trackId, artist.id);

  res.json({ success: true, message: 'Upload marked as complete. Transcoding started.' });
});

/** PATCH /catalog/tracks/:trackId — update track metadata or status (owner only) */
export const updateTrack: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId || (req.headers['x-user-id'] as string);
  const { trackId } = req.params as { trackId: string };
  const input = req.body as UpdateTrackInput;

  const artist = await artistService.getArtistByUserId(userId);
  const track = await trackService.updateTrack(trackId, artist.id, input);

  res.json({ success: true, data: track, message: 'Track updated' });
});

/** DELETE /catalog/tracks/:trackId — delete track (owner only) */
export const deleteTrack: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId || (req.headers['x-user-id'] as string);
  const { trackId } = req.params as { trackId: string };

  const artist = await artistService.getArtistByUserId(userId);
  await trackService.deleteTrack(trackId, artist.id);

  res.status(204).send();
});

/** POST /catalog/tracks/:trackId/play — increment play count */
export const incrementPlay: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { trackId } = req.params as { trackId: string };
  await trackService.incrementPlayCount(trackId);
  res.json({ success: true, message: 'Play count incremented' });
});
