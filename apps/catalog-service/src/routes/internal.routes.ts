/**
 * Internal routes for catalog-service — called by other backend services.
 *
 * These endpoints are NOT exposed through the API Gateway.
 * They are protected by a shared X-Service-Secret header (the JWT_SECRET).
 *
 * POST /internal/tracks/:trackId/ready   — stream-service calls this after transcoding
 * POST /internal/tracks/:trackId/failed  — stream-service calls this on error
 */

import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction } from 'express';
import { catchAsync, AppError } from '@streamify/shared-middleware';
import { prisma } from '../config/db.js';
import { publishTrackStatusUpdated } from '../events/publisher.js';

const router: ExpressRouter = Router();

// ── Service-to-service auth middleware ────────────────────────────────────────
function requireServiceSecret(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.headers['x-service-secret'];
  const expected = process.env['JWT_SECRET'];
  if (!provided || provided !== expected) {
    next(new AppError('Unauthorized — invalid service secret', 401));
    return;
  }
  next();
}

router.use(requireServiceSecret);

/**
 * POST /internal/tracks/:trackId/ready
 * Called by stream-service when HLS transcoding completes.
 *
 * Body: { hlsKey: string, durationMs?: number }
 */
router.post(
  '/tracks/:trackId/ready',
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { trackId } = req.params as { trackId: string };
    const { hlsKey, durationMs } = req.body as { hlsKey?: string; durationMs?: number };

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new AppError('Track not found', 404);

    const updated = await prisma.track.update({
      where: { id: trackId },
      data: {
        status: 'READY',
        ...(hlsKey ? { s3KeyHls: hlsKey } : {}),
        ...(durationMs ? { durationMs } : {}),
      },
    });

    publishTrackStatusUpdated({
      trackId: updated.id,
      artistId: updated.artistId,
      status: 'READY',
      ...(hlsKey ? { s3KeyHls: hlsKey } : {}),
    });

    res.json({ success: true, data: { id: updated.id, status: updated.status } });
  }),
);

/**
 * POST /internal/tracks/:trackId/failed
 * Called by stream-service when transcoding fails.
 *
 * Body: { reason: string }
 */
router.post(
  '/tracks/:trackId/failed',
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { trackId } = req.params as { trackId: string };

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new AppError('Track not found', 404);

    const updated = await prisma.track.update({
      where: { id: trackId },
      data: { status: 'FAILED' },
    });

    publishTrackStatusUpdated({
      trackId: updated.id,
      artistId: updated.artistId,
      status: 'FAILED',
    });

    res.json({ success: true, data: { id: updated.id, status: updated.status } });
  }),
);

export default router;
