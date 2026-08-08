import type { Request, Response, RequestHandler } from 'express';
import { AppError, catchAsync } from '@streamify/shared-middleware';
import { Like } from '../models/likes.model.js';

function toPage(query: unknown): { page: number; limit: number } {
  const q = query as { page?: string; limit?: string };
  return {
    page: q.page ? parseInt(q.page, 10) : 1,
    limit: q.limit ? parseInt(q.limit, 10) : 20,
  };
}

export const likeTrack: RequestHandler = catchAsync(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { trackId } = req.params as { trackId: string };

  try {
    const like = await Like.create({ userId, trackId });
    res.status(201).json({ success: true, data: like });
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate key error
      res.status(200).json({ success: true, message: 'Already liked' });
    } else {
      throw err;
    }
  }
});

export const unlikeTrack: RequestHandler = catchAsync(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { trackId } = req.params as { trackId: string };

  const result = await Like.deleteOne({ userId, trackId });
  if (result.deletedCount === 0) {
    throw AppError.notFound('Like not found');
  }

  res.status(204).send();
});

export const getLikedSongs: RequestHandler = catchAsync(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { page, limit } = toPage(req.query);

  const total = await Like.countDocuments({ userId });
  const likes = await Like.find({ userId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    success: true,
    data: likes,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});
