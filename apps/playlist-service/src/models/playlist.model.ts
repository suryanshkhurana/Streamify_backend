/**
 * src/models/playlist.model.ts
 *
 * Mongoose schema matching the Streamify context document.
 *
 * Playlist document shape:
 * {
 *   ownerId:        string        — userId from auth-service JWT
 *   name:           string
 *   description:    string?
 *   coverUrl:       string?
 *   visibility:     'public' | 'private' | 'unlisted'
 *   collaborators:  string[]      — userIds who can add/remove tracks
 *   tracks: [
 *     { trackId: string, addedBy: string, position: number, addedAt: Date }
 *   ]
 *   isSystemPlaylist: boolean     — true for Liked Songs etc. (immutable owner)
 *   createdAt / updatedAt         — via Mongoose timestamps
 * }
 */

import mongoose, { type Document, type Model, Schema } from 'mongoose';

// ─── Sub-document: PlaylistTrack ─────────────────────────────────────────────

export interface IPlaylistTrack {
  trackId: string;
  addedBy: string;   // userId
  position: number;  // 0-indexed; maintained on every mutation
  addedAt: Date;
}

const PlaylistTrackSchema = new Schema<IPlaylistTrack>(
  {
    trackId:  { type: String, required: true },
    addedBy:  { type: String, required: true },
    position: { type: Number, required: true, min: 0 },
    addedAt:  { type: Date,   default: () => new Date() },
  },
  { _id: false },   // no extra _id on subdocuments
);

// ─── Main Playlist document ───────────────────────────────────────────────────

export type Visibility = 'public' | 'private' | 'unlisted';

export interface IPlaylist extends Document {
  ownerId:          string;
  name:             string;
  description:      string;
  coverUrl:         string;
  visibility:       Visibility;
  collaborators:    string[];   // array of userId strings
  tracks:           IPlaylistTrack[];
  isSystemPlaylist: boolean;
  createdAt:        Date;
  updatedAt:        Date;
}

const PlaylistSchema = new Schema<IPlaylist>(
  {
    ownerId:     { type: String, required: true, index: true },
    name:        { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    coverUrl:    { type: String, default: '' },
    visibility:  {
      type:    String,
      enum:    ['public', 'private', 'unlisted'],
      default: 'private',
    },
    collaborators:    { type: [String], default: [] },
    tracks:           { type: [PlaylistTrackSchema], default: [] },
    isSystemPlaylist: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        const r = ret as Record<string, unknown>;
        r['id'] = r['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete r['_id'];
        delete r['__v'];
        return ret;
      },
    },
  },
);

// Compound index: fast "my playlists" queries
PlaylistSchema.index({ ownerId: 1, createdAt: -1 });
// Fast public browsing
PlaylistSchema.index({ visibility: 1, updatedAt: -1 });

export const Playlist: Model<IPlaylist> = mongoose.model<IPlaylist>(
  'Playlist',
  PlaylistSchema,
);
