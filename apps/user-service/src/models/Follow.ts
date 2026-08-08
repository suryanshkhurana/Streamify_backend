/**
 * Follow Mongoose schema / model.
 *
 * Stores follower → followed relationships.
 * targetType discriminates between following a User vs an Artist.
 *
 * A composite unique index on (followerId, followedId, targetType)
 * prevents duplicate follows.
 */

import { Schema, model, type Document, type Model } from 'mongoose';
import type { FollowTargetType } from '@streamify/shared-types';

export interface IFollow {
  /** authId of the user who clicked "Follow". */
  followerId: string;
  /** authId of the user being followed (or artistId if targetType = ARTIST). */
  followedId: string;
  targetType: FollowTargetType;
}

export interface IFollowDocument extends IFollow, Document {}

const followSchema = new Schema<IFollowDocument>(
  {
    followerId: { type: String, required: true, index: true },
    followedId: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: ['USER', 'ARTIST'],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // follow has no updatedAt
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

// Prevent duplicate follows
followSchema.index(
  { followerId: 1, followedId: 1, targetType: 1 },
  { unique: true },
);

export const Follow: Model<IFollowDocument> = model<IFollowDocument>(
  'Follow',
  followSchema,
);
