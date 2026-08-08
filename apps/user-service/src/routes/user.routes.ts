/**
 * User router — mounts all /users/* endpoints.
 *
 * Route map:
 *   GET    /users/me                  Return calling user's full profile
 *   PUT    /users/me                  Update display name, country, bio
 *   PUT    /users/me/preferences      Update audio/notification preferences
 *   GET    /users/me/history          Paginated listening history
 *
 *   GET    /users/:id                 Public profile (cached)
 *   GET    /users/:id/followers       Paginated follower list
 *   GET    /users/:id/following       Paginated following list
 *   POST   /users/:id/follow          Follow a user or artist
 *   DELETE /users/:id/follow          Unfollow
 *
 * Auth:
 *   All /me routes → authenticate (JWT required)
 *   GET /users/:id routes → optionalAuthenticate
 *   POST/DELETE follow → authenticate
 */

import { Router, type IRouter } from 'express';
import {
  authenticate,
  optionalAuthenticate,
  validate,
} from '@streamify/shared-middleware';

import * as profileController from '../controllers/profile.controller.js';
import * as followController from '../controllers/follow.controller.js';
import * as historyController from '../controllers/history.controller.js';
import * as pfpController from '../controllers/profile-picture.controller.js';

import {
  updateProfileSchema,
  updatePreferencesSchema,
  followSchema,
  paginationSchema,
} from '../validators/user.validators.js';

const router: IRouter = Router();

// ─── /me routes (all require authentication) ──────────────────────────────────
router.get('/me', authenticate, profileController.getMe);
router.put('/me', authenticate, validate(updateProfileSchema, 'body'), profileController.updateMe);
router.put('/me/preferences', authenticate, validate(updatePreferencesSchema, 'body'), profileController.updatePreferences);
router.get('/me/history', authenticate, validate(paginationSchema, 'query'), historyController.getHistory);

// ─── Profile picture upload (2-step presigned flow) ───────────────────────────
router.post('/:userId/profile-picture/upload-url', authenticate, pfpController.getUploadUrl);
router.post('/:userId/profile-picture/confirm', authenticate, pfpController.confirmUpload);

// ─── Public profile routes ────────────────────────────────────────────────────
router.get('/:id', optionalAuthenticate, profileController.getProfile);
router.get('/:id/followers', optionalAuthenticate, validate(paginationSchema, 'query'), followController.getFollowers);
router.get('/:id/following', optionalAuthenticate, validate(paginationSchema, 'query'), followController.getFollowing);

// ─── Follow / unfollow (require authentication) ───────────────────────────────
router.post('/:id/follow', authenticate, validate(followSchema, 'body'), followController.follow);
router.delete('/:id/follow', authenticate, followController.unfollow);

export default router;
