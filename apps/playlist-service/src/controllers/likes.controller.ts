import type { Request, Response, RequestHandler } from 'express';
import { AppError, catchAsync } from '@streamify/shared-middleware';
import { prisma } from '../config/prisma.js';


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
    const like = await prisma.like.create({ 
      data: { userId, entityId: trackId, entityType: 'TRACK' } 
    });
    res.status(201).json({ success: true, data: like });
  } catch (err: any) {
    if (err && err.code === 'P2002') {
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

  try {
    await prisma.like.delete({ 
      where: { 
        userId_entityId_entityType: { userId, entityId: trackId, entityType: 'TRACK' }
      } 
    });
  } catch (err: any) {
    if (err && err.code === 'P2025') {
      throw AppError.notFound('Like not found');
    }
    throw err;
  }

  res.status(204).send();
});

export const getLikedSongs: RequestHandler = catchAsync(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { page, limit } = toPage(req.query);
  const skip = (page - 1) * limit;

  const [total, likes] = await Promise.all([
    prisma.like.count({ where: { userId, entityType: 'TRACK' } }),
    prisma.like.findMany({
      where: { userId, entityType: 'TRACK' },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    })
  ]);

  res.json({
    success: true,
    data: likes,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});
