/**
 * Stream routes — /stream
 *
 * GET /stream/:trackId  → return CloudFront-signed HLS URL (auth required)
 */

import { Router } from 'express';
import { authenticate } from '@streamify/shared-middleware';
import { getStreamUrl } from '../controllers/stream.controller.js';

const router: Router = Router();

// All streaming endpoints require a valid JWT
router.use(authenticate);

/**
 * GET /stream/:trackId
 * Returns a signed CDN URL for the HLS master playlist.
 */
router.get('/:trackId', getStreamUrl);

export default router;
