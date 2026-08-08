/**
 * src/middleware/requireOwnerOrCollaborator.ts
 *
 * Explicit RequestHandler type annotations fix TS2742.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError, catchAsync } from '@streamify/shared-middleware';
import { Playlist } from '../models/playlist.model.js';

export const requireOwnerOrCollaborator: RequestHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id } = req.params;
    const userId = req.userId!;

    const playlist = await Playlist.findById(id);

    if (!playlist) {
      throw AppError.notFound(`Playlist ${id} not found`);
    }

    const isOwner        = playlist.ownerId === userId;
    const isCollaborator = playlist.collaborators.includes(userId);

    if (!isOwner && !isCollaborator) {
      throw AppError.forbidden('You do not have permission to modify this playlist');
    }

    res.locals['playlist'] = playlist;

    next();
  },
);

export const requireOwner: RequestHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id } = req.params;
    const userId = req.userId!;

    const playlist = await Playlist.findById(id);

    if (!playlist) {
      throw AppError.notFound(`Playlist ${id} not found`);
    }

    if (playlist.ownerId !== userId) {
      throw AppError.forbidden('Only the playlist owner can perform this action');
    }

    res.locals['playlist'] = playlist;

    next();
  },
);
