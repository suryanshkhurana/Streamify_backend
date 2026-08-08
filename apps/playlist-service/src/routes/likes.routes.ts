import { Router, type Router as ExpressRouter } from 'express';
import { authenticate } from '@streamify/shared-middleware';
import { likeTrack, unlikeTrack, getLikedSongs } from '../controllers/likes.controller.js';

const router: ExpressRouter = Router();

router.use(authenticate);

router.get('/', getLikedSongs);
router.post('/:trackId', likeTrack);
router.delete('/:trackId', unlikeTrack);

export default router;
