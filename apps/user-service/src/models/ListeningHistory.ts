/**
 * ListeningHistory Mongoose schema / model.
 *
 * One document per play event, appended when the user-service receives
 * the `track.played` RabbitMQ event from the stream-service.
 *
 * Queries:
 *   - GET /users/me/history → find({ userId }) sort createdAt DESC, paginate
 */

import { Schema, model, type Document, type Model } from 'mongoose';
import type { PlaybackContext } from '@streamify/shared-types';

// ─── Embedded PlaybackContext ────────────────────────────────────────────────

const playbackContextSchema = new Schema<PlaybackContext>(
  {
    type: {
      type: String,
      enum: ['PLAYLIST', 'ALBUM', 'ARTIST_PAGE', 'SEARCH', 'DISCOVER', 'QUEUE', 'UNKNOWN'],
      required: true,
    },
    sourceId: { type: String },
  },
  { _id: false },
);

// ─── Embedded TrackSummary ───────────────────────────────────────────────────

interface ITrackSummary {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  coverUrl: string;
  durationMs: number;
  explicit: boolean;
}

const trackSummarySchema = new Schema<ITrackSummary>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    artistId: { type: String, required: true },
    artistName: { type: String, required: true },
    albumId: { type: String, required: true },
    albumName: { type: String, required: true },
    coverUrl: { type: String, required: true },
    durationMs: { type: Number, required: true },
    explicit: { type: Boolean, default: false },
  },
  { _id: false },
);

// ─── ListeningHistory document ───────────────────────────────────────────────

export interface IListeningHistory {
  /** authId of the listener. */
  userId: string;
  trackId: string;
  /** Denormalised track data snapshotted at play time. */
  track?: ITrackSummary;
  durationPlayedMs: number;
  /** Fraction 0–1: durationPlayed / track.durationMs */
  completionRatio: number;
  context: PlaybackContext;
  playedAt: Date;
}

export interface IListeningHistoryDocument extends IListeningHistory, Document {}

const listeningHistorySchema = new Schema<IListeningHistoryDocument>(
  {
    userId: { type: String, required: true, index: true },
    trackId: { type: String, required: true },
    track: { type: trackSummarySchema },
    durationPlayedMs: { type: Number, required: true, min: 0 },
    completionRatio: { type: Number, required: true, min: 0, max: 1 },
    context: { type: playbackContextSchema, required: true },
    playedAt: { type: Date, required: true, default: () => new Date() },
  },
  {
    timestamps: false,
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

// Compound index: fast per-user history retrieval in reverse chronological order
listeningHistorySchema.index({ userId: 1, playedAt: -1 });

export const ListeningHistory: Model<IListeningHistoryDocument> =
  model<IListeningHistoryDocument>('ListeningHistory', listeningHistorySchema);
