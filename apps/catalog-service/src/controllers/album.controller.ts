/**
 * Album controller — HTTP handlers for /catalog/albums endpoints.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import * as albumService from '../services/album.service.js';
import * as artistService from '../services/artist.service.js';
import type { CreateAlbumInput, UpdateAlbumInput, ListQuery } from '../validators/catalog.validators.js';

/** GET /catalog/albums — list all albums (paginated) */
export const listAlbums: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as ListQuery;
  const result = await albumService.listAlbums(query);
  res.json({ success: true, ...result });
});

/** GET /catalog/albums/:albumId — get a single album with its tracks */
export const getAlbum: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { albumId } = req.params as { albumId: string };
  const album = await albumService.getAlbumById(albumId);
  res.json({ success: true, data: album });
});

/** POST /catalog/albums — create a new album (artist only) */
export const createAlbum: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const input = req.body as CreateAlbumInput;

  // Resolve userId → artistId (auto-creates artist profile if missing)
  const artist = await artistService.getOrCreateArtist(userId, 'Unknown Artist');
  const album = await albumService.createAlbum(artist.id, input);

  res.status(201).json({ success: true, data: album });
});

/** PUT /catalog/albums/:albumId — update album (owner only) */
export const updateAlbum: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { albumId } = req.params as { albumId: string };
  const input = req.body as UpdateAlbumInput;

  const artist = await artistService.getArtistByUserId(userId);
  const album = await albumService.updateAlbum(albumId, artist.id, input);

  res.json({ success: true, data: album, message: 'Album updated' });
});

/** DELETE /catalog/albums/:albumId — delete album (owner only) */
export const deleteAlbum: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { albumId } = req.params as { albumId: string };

  const artist = await artistService.getArtistByUserId(userId);
  await albumService.deleteAlbum(albumId, artist.id);

  res.status(204).send();
});
