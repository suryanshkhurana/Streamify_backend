/**
 * Follow service — follow / unfollow users and artists.
 *
 * Counts are maintained on the Profile documents using increment to keep
 * followerCount / followingCount eventually consistent without transactions.
 */

import type { FollowTargetType } from '@streamify/shared-types';
import type { FollowInput } from '../validators/user.validators.js';
import { prisma } from '../config/prisma.js';
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
    const target = await prisma.profile.findUnique({ where: { authId: followedId } });
    if (!target) throw AppError.notFound('User not found');
  }

  try {
    await prisma.follow.create({
      data: {
        followerId,
        followingId: followedId,
        // Prisma schema doesn't store targetType, but if needed we can assume USER
      },
    });
  } catch (err: unknown) {
    // Prisma unique constraint error code = P2002
    if (err && (err as any).code === 'P2002') {
      throw AppError.badRequest('Already following this user');
    }
    throw err;
  }

  // Update counters
  if (input.targetType === 'USER') {
    const [followerDoc] = await Promise.all([
      prisma.profile.update({
        where: { authId: followerId },
        data: { followingCount: { increment: 1 } },
      }).catch(() => null), // Catch if profile doesn't exist
      prisma.profile.update({
        where: { authId: followedId },
        data: { followerCount: { increment: 1 } },
      }).catch(() => null),
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
    await prisma.profile.update({
      where: { authId: followerId },
      data: { followingCount: { increment: 1 } },
    }).catch(() => null);

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
  try {
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId: followedId,
        }
      }
    });
  } catch (err) {
    if (err && (err as any).code === 'P2025') {
      throw AppError.notFound('Follow relationship not found');
    }
    throw err;
  }

  // Update counters
  if (targetType === 'USER') {
    await Promise.all([
      prisma.profile.update({
        where: { authId: followerId },
        data: { followingCount: { decrement: 1 } },
      }).catch(() => null),
      prisma.profile.update({
        where: { authId: followedId },
        data: { followerCount: { decrement: 1 } },
      }).catch(() => null),
    ]);
  } else {
    await prisma.profile.update({
      where: { authId: followerId },
      data: { followingCount: { decrement: 1 } },
    }).catch(() => null);
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
    prisma.follow.findMany({
      where: { followingId: authId }, // People who are following authId
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.follow.count({
      where: { followingId: authId },
    }),
  ]);

  const followerIds = follows.map((f: any) => f.followerId);
  const profiles = await prisma.profile.findMany({
    where: { authId: { in: followerIds } },
    select: { authId: true, displayName: true, avatarUrl: true, isVerifiedArtist: true },
  });

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
    prisma.follow.findMany({
      where: { followerId: authId }, // People who authId is following
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.follow.count({
      where: { followerId: authId },
    }),
  ]);

  const followedIds = follows.map((f: any) => f.followingId);
  const profiles = await prisma.profile.findMany({
    where: { authId: { in: followedIds } },
    select: { authId: true, displayName: true, avatarUrl: true, isVerifiedArtist: true },
  });

  return { profiles, total, page, limit, totalPages: Math.ceil(total / limit) };
}
