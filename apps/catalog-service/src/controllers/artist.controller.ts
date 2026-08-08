/**
 * Artist controller — HTTP handlers for /catalog/artists endpoints.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import * as artistService from '../services/artist.service.js';
import type { CreateArtistInput, UpdateArtistInput, ListQuery } from '../validators/catalog.validators.js';

/** GET /catalog/artists — list all artists (paginated) */
export const listArtists: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as ListQuery;
  const result = await artistService.listArtists(query);
  res.json({ success: true, ...result });
});

/** POST /catalog/artists — create artist profile for authenticated user */
export const createArtist: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const input = req.body as CreateArtistInput;
  const artist = await artistService.createArtist(userId, input);
  res.status(201).json({ success: true, data: artist });
});

/** GET /catalog/artists/me — get my artist profile */
export const getMyArtist: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const artist = await artistService.getArtistByUserId(userId);
  res.json({ success: true, data: artist });
});

/** GET /catalog/artists/:artistId — get public artist profile */
export const getArtist: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { artistId } = req.params as { artistId: string };
  const artist = await artistService.getArtistById(artistId);
  res.json({ success: true, data: artist });
});

/** PUT /catalog/artists/me — update my artist profile */
export const updateArtist: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const input = req.body as UpdateArtistInput;
  const artist = await artistService.updateArtist(userId, input);
  res.json({ success: true, data: artist, message: 'Artist profile updated' });
});
