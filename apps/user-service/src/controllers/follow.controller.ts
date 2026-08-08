/**
 * Follow controller — HTTP handlers for follow/unfollow endpoints.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import type { FollowInput, PaginationInput } from '../validators/user.validators.js';
import type { FollowTargetType } from '@streamify/shared-types';
import * as followService from '../services/follow.service.js';

/** POST /users/:id/follow */
export const follow: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const followerId = req.userId!;
  const { id: followedId } = req.params as { id: string };
  const input = req.body as FollowInput;

  await followService.followUser(followerId, followedId, input);
  res.status(201).json({ success: true, message: 'Followed successfully' });
});

/** DELETE /users/:id/follow */
export const unfollow: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const followerId = req.userId!;
  const { id: followedId } = req.params as { id: string };
  const { targetType } = req.query as { targetType?: FollowTargetType };

  await followService.unfollowUser(followerId, followedId, targetType ?? ('USER' as FollowTargetType));
  res.json({ success: true, message: 'Unfollowed successfully' });
});

/** GET /users/:id/followers */
export const getFollowers: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { page, limit } = req.query as unknown as PaginationInput;

  const result = await followService.getFollowers(id, page ?? 1, limit ?? 20);
  res.json({ success: true, data: result });
});

/** GET /users/:id/following */
export const getFollowing: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { page, limit } = req.query as unknown as PaginationInput;

  const result = await followService.getFollowing(id, page ?? 1, limit ?? 20);
  res.json({ success: true, data: result });
});
