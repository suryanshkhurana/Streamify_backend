/**
 * Track routes — /catalog/tracks
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '@streamify/shared-middleware';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createTrackSchema, updateTrackSchema, listQuerySchema } from '../validators/catalog.validators.js';
import * as trackController from '../controllers/track.controller.js';

const router: ExpressRouter = Router();

/** Public routes */
router.get('/', validateQuery(listQuerySchema), trackController.listTracks);
router.get('/:trackId', trackController.getTrack);
router.post('/:trackId/play', trackController.incrementPlay);

/** Authenticated routes */
router.use(authenticate);
router.post('/', validateBody(createTrackSchema), trackController.createTrack);
router.post('/:trackId/upload-complete', trackController.completeTrackUpload);
router.patch('/:trackId', validateBody(updateTrackSchema), trackController.updateTrack);
router.delete('/:trackId', trackController.deleteTrack);

export default router;
