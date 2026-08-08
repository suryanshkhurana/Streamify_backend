/**
 * Album routes — /catalog/albums
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '@streamify/shared-middleware';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createAlbumSchema, updateAlbumSchema, listQuerySchema } from '../validators/catalog.validators.js';
import * as albumController from '../controllers/album.controller.js';

const router: ExpressRouter = Router();

/** Public routes */
router.get('/', validateQuery(listQuerySchema), albumController.listAlbums);
router.get('/:albumId', albumController.getAlbum);

/** Authenticated routes */
router.use(authenticate);
router.post('/', validateBody(createAlbumSchema), albumController.createAlbum);
router.put('/:albumId', validateBody(updateAlbumSchema), albumController.updateAlbum);
router.delete('/:albumId', albumController.deleteAlbum);

export default router;
