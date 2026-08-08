/**
 * Artist routes — /catalog/artists
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '@streamify/shared-middleware';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createArtistSchema, updateArtistSchema, listQuerySchema } from '../validators/catalog.validators.js';
import * as artistController from '../controllers/artist.controller.js';

const router: ExpressRouter = Router();

/** Public routes */
router.get('/', validateQuery(listQuerySchema), artistController.listArtists);
router.get('/:artistId', artistController.getArtist);

/** Authenticated routes */
router.use(authenticate);
router.post('/', validateBody(createArtistSchema), artistController.createArtist);
router.get('/me/profile', artistController.getMyArtist);
router.put('/me', validateBody(updateArtistSchema), artistController.updateArtist);

export default router;
