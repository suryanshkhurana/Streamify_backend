/**
 * Profile controller — HTTP handlers for profile endpoints.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import type { UpdateProfileInput, UpdatePreferencesInput } from '../validators/user.validators.js';
import * as profileService from '../services/profile.service.js';

/** GET /users/me */
export const getMe: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const authId = req.userId!;
  const profile = await profileService.getMyProfile(authId);
  res.json({ success: true, data: profile });
});

/** GET /users/:id */
export const getProfile: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const profile = await profileService.getPublicProfile(id);
  res.json({ success: true, data: profile });
});

/** PUT /users/me */
export const updateMe: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const authId = req.userId!;
  const input = req.body as UpdateProfileInput;
  const profile = await profileService.updateMyProfile(authId, input);
  res.json({ success: true, data: profile, message: 'Profile updated' });
});

/** PUT /users/me/preferences */
export const updatePreferences: RequestHandler = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const authId = req.userId!;
  const input = req.body as UpdatePreferencesInput;
  const preferences = await profileService.updateMyPreferences(authId, input);
  res.json({ success: true, data: preferences, message: 'Preferences updated' });
});
