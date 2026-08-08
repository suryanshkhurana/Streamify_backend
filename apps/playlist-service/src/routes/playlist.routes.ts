/**
 * src/routes/playlist.routes.ts
 *
 * All /playlists routes wired to controllers with correct middleware guards.
 *
 * Route Summary:
 *
 *  Public / Optional Auth:
 *    GET  /playlists/featured          → getFeatured       (no auth)
 *    GET  /playlists/public            → listPublicPlaylists
 *    GET  /playlists/:id               → getPlaylist       (visibility-gated)
 *
 *  Authenticated:
 *    GET    /playlists                 → listMyPlaylists   (own playlists)
 *    POST   /playlists                 → createPlaylist
 *
 *  Owner OR Collaborator:
 *    POST   /playlists/:id/tracks      → addTracks
 *    DELETE /playlists/:id/tracks/:trackId → removeTrack
 *    PUT    /playlists/:id/tracks/reorder  → reorderTracks
 *
 *  Owner Only:
 *    PATCH  /playlists/:id             → updatePlaylist
 *    DELETE /playlists/:id             → deletePlaylist
 *    POST   /playlists/:id/collaborators          → addCollaborator
 *    DELETE /playlists/:id/collaborators/:userId  → removeCollaborator
 */

import { Router, type Router as ExpressRouter } from 'express';
import { authenticate, optionalAuthenticate, validate } from '@streamify/shared-middleware';

import {
  getFeatured,
  listMyPlaylists,
  listPublicPlaylists,
  createPlaylist,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTracks,
  removeTrack,
  reorderTracks,
  addCollaborator,
  removeCollaborator,
} from '../controllers/playlist.controller.js';

import {
  requireOwner,
  requireOwnerOrCollaborator,
} from '../middleware/requireOwnerOrCollaborator.js';

import {
  createPlaylistSchema,
  updatePlaylistSchema,
  addTracksSchema,
  reorderTracksSchema,
  addCollaboratorSchema,
  listPlaylistsQuerySchema,
} from '../validators/playlist.validators.js';

const router: ExpressRouter = Router();

// ─── Static / no auth ────────────────────────────────────────────────────────
// IMPORTANT: /featured must be declared BEFORE /:id so Express doesn't treat
// the word "featured" as a dynamic :id parameter.
router.get('/featured', getFeatured);
router.get('/public',   validate(listPlaylistsQuerySchema, 'query'), listPublicPlaylists);

// ─── Authenticated — own playlist operations ─────────────────────────────────
router.get(
  '/',
  authenticate,
  validate(listPlaylistsQuerySchema, 'query'),
  listMyPlaylists,
);

router.post(
  '/',
  authenticate,
  validate(createPlaylistSchema, 'body'),
  createPlaylist,
);

// ─── Single playlist — visibility-gated (optional auth) ──────────────────────
router.get('/:id', optionalAuthenticate, getPlaylist);

// ─── Owner-only operations ────────────────────────────────────────────────────
router.patch(
  '/:id',
  authenticate,
  requireOwner,
  validate(updatePlaylistSchema, 'body'),
  updatePlaylist,
);

router.delete(
  '/:id',
  authenticate,
  requireOwner,
  deletePlaylist,
);

// ─── Collaborator management (owner only) ─────────────────────────────────────
router.post(
  '/:id/collaborators',
  authenticate,
  requireOwner,
  validate(addCollaboratorSchema, 'body'),
  addCollaborator,
);

router.delete(
  '/:id/collaborators/:userId',
  authenticate,
  requireOwner,
  removeCollaborator,
);

// ─── Track management (owner OR collaborator) ────────────────────────────────

// PUT reorder must come BEFORE the DELETE /:trackId route to avoid ambiguity
router.put(
  '/:id/tracks/reorder',
  authenticate,
  requireOwnerOrCollaborator,
  validate(reorderTracksSchema, 'body'),
  reorderTracks,
);

router.post(
  '/:id/tracks',
  authenticate,
  requireOwnerOrCollaborator,
  validate(addTracksSchema, 'body'),
  addTracks,
);

router.delete(
  '/:id/tracks/:trackId',
  authenticate,
  requireOwnerOrCollaborator,
  removeTrack,
);

export default router;
