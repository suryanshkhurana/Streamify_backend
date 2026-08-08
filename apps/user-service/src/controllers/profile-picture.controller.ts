/**
 * profile-picture.controller.ts
 *
 * HTTP handlers for the two-step profile picture upload flow.
 *
 *   POST /users/:userId/profile-picture/upload-url
 *     Body: { mimeType: string; fileSizeBytes: number }
 *     Returns: { uploadUrl, s3Key, expiresIn }
 *
 *   POST /users/:userId/profile-picture/confirm
 *     Body: { s3Key: string }
 *     Returns: { avatarUrl }
 *
 * Both endpoints require authentication and verify that the authenticated
 * user's authId matches the :userId path param (users cannot change each
 * other's profile pictures).
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync, AppError } from '@streamify/shared-middleware';
import * as pfpService from '../services/profile-picture.service.js';

/**
 * POST /users/:userId/profile-picture/upload-url
 *
 * Generates an S3 presigned PUT URL scoped to
 * profile-pictures/{userId}/{uuid}.{ext}.
 *
 * Restricted to: image/jpeg | image/png | image/webp
 * Max file size : 5 MB
 * URL expiry    : 5 minutes
 */
export const getUploadUrl: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const callerAuthId = req.userId!;

    // Users may only request upload URLs for their own profile
    if (callerAuthId !== userId) {
      throw new AppError('Forbidden — you can only update your own profile picture', 403);
    }

    const { mimeType, fileSizeBytes } = req.body as {
      mimeType?: unknown;
      fileSizeBytes?: unknown;
    };

    if (typeof mimeType !== 'string' || !mimeType) {
      throw new AppError('mimeType is required', 400);
    }
    if (typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) {
      throw new AppError('fileSizeBytes must be a positive number', 400);
    }

    const result = await pfpService.generateUploadUrl(userId, mimeType, fileSizeBytes);

    res.status(200).json({
      success: true,
      data: result,
    });
  },
);

/**
 * POST /users/:userId/profile-picture/confirm
 *
 * Verifies the uploaded file (magic bytes check), updates the user's
 * avatarUrl in MongoDB to the CloudFront URL, invalidates Redis cache,
 * and schedules deletion of the previous profile picture via RabbitMQ.
 */
export const confirmUpload: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const callerAuthId = req.userId!;

    // Users may only confirm uploads for their own profile
    if (callerAuthId !== userId) {
      throw new AppError('Forbidden — you can only update your own profile picture', 403);
    }

    const { s3Key } = req.body as { s3Key?: unknown };

    if (typeof s3Key !== 'string' || !s3Key.trim()) {
      throw new AppError('s3Key is required', 400);
    }

    const result = await pfpService.confirmUpload(userId, s3Key.trim());

    res.status(200).json({
      success: true,
      data: result,
      message: 'Profile picture updated successfully',
    });
  },
);
