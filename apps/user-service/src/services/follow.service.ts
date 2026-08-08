/**
 * Follow service — follow / unfollow users and artists.
 *
 * Counts are maintained on the Profile documents using $inc to keep
 * followerCount / followingCount eventually consistent without transactions.
 */

import type { FollowTargetType } from '@streamify/shared-types';
import type { FollowInput } from '../validators/user.validators.js';
import { Follow } from '../models/Follow.js';
import { Profile } from '../models/Profile.js';
import { AppError, logger } from '@streamify/shared-middleware';
import { publishUserFollowed } from '../events/publisher.js';

/**
 * POST /users/:id/follow
 * The calling user (followerId) follows the target (followedId).
 */
export async function followUser(
  followerId: string,
  followedId: string,
  input: FollowInput,
): Promise<void> {
  if (followerId === followedId) {
    throw AppError.badRequest('You cannot follow yourself');
  }

  // Verify target exists when following a USER
  if (input.targetType === 'USER') {
    const target = await Profile.findOne({ authId: followedId });
    if (!target) throw AppError.notFound('User not found');
  }

  try {
    await Follow.create({
      followerId,
      followedId,
      targetType: input.targetType as FollowTargetType,
    });
  } catch (err: unknown) {
    // Mongo duplicate key error code = 11000
    if (
      err instanceof Error &&
      'code' in err &&
      Number((err as NodeJS.ErrnoException).code) === 11000
    ) {
      throw AppError.conflict('Already following this user');
    }
    throw err;
  }

  // Update counters
  if (input.targetType === 'USER') {
    const [followerDoc] = await Promise.all([
      Profile.findOneAndUpdate(
        { authId: followerId },
        { $inc: { followingCount: 1 } },
        { new: true },
      ),
      Profile.updateOne({ authId: followedId }, { $inc: { followerCount: 1 } }),
    ]);

    // Publish event so notification-service can alert the followed user
    await publishUserFollowed({
      followerId,
      followerDisplayName: followerDoc?.displayName ?? followerId,
      followedId,
      targetType: input.targetType as FollowTargetType,
    });
  } else {
    // Artist follow — only increment the follower's following count
    await Profile.updateOne({ authId: followerId }, { $inc: { followingCount: 1 } });

    // Still publish so notification-service can notify the artist
    await publishUserFollowed({
      followerId,
      followerDisplayName: followerId,
      followedId,
      targetType: input.targetType as FollowTargetType,
    });
  }

  logger.info({ followerId, followedId, targetType: input.targetType }, '[follow] created');
}

/**
 * DELETE /users/:id/follow
 * The calling user (followerId) unfollows the target.
 */
export async function unfollowUser(
  followerId: string,
  followedId: string,
  targetType: FollowTargetType,
): Promise<void> {
  const result = await Follow.deleteOne({ followerId, followedId, targetType });

  if (result.deletedCount === 0) {
    throw AppError.notFound('Follow relationship not found');
  }

  // Update counters
  if (targetType === 'USER') {
    await Promise.all([
      Profile.updateOne({ authId: followerId }, { $inc: { followingCount: -1 } }),
      Profile.updateOne({ authId: followedId }, { $inc: { followerCount: -1 } }),
    ]);
  } else {
    await Profile.updateOne({ authId: followerId }, { $inc: { followingCount: -1 } });
  }

  logger.info({ followerId, followedId, targetType }, '[follow] deleted');
}

/**
 * GET /users/:id/followers — paginated list of followers.
 */
export async function getFollowers(
  authId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;
  const [follows, total] = await Promise.all([
    Follow.find({ followedId: authId, targetType: 'USER' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Follow.countDocuments({ followedId: authId, targetType: 'USER' }),
  ]);

  const followerIds = follows.map((f) => f.followerId);
  const profiles = await Profile.find({ authId: { $in: followerIds } })
    .select('authId displayName avatarUrl isVerifiedArtist')
    .lean();

  return { profiles, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * GET /users/:id/following — paginated list of users this user follows.
 */
export async function getFollowing(
  authId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;
  const [follows, total] = await Promise.all([
    Follow.find({ followerId: authId, targetType: 'USER' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Follow.countDocuments({ followerId: authId, targetType: 'USER' }),
  ]);

  const followedIds = follows.map((f) => f.followedId);
  const profiles = await Profile.find({ authId: { $in: followedIds } })
    .select('authId displayName avatarUrl isVerifiedArtist')
    .lean();

  return { profiles, total, page, limit, totalPages: Math.ceil(total / limit) };
}
