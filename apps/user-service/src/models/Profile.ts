/**
 * Profile Mongoose schema / model.
 *
 * One document per user. Created automatically when the user-service
 * receives the `user.registered` RabbitMQ event from the auth-service.
 *
 * The `authId` field mirrors the auth-service primary key (PostgreSQL UUID)
 * and is the cross-service identity key used in JWT payloads and HTTP headers.
 */

import { Schema, model, type Document, type Model } from 'mongoose';
import type { AudioQuality, OAuthProvider } from '@streamify/shared-types';

// ─── Preferences sub-document ─────────────────────────────────────────────────

export interface IUserPreferences {
  audioQuality: AudioQuality;
  explicitContent: boolean;
  language: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  preferredGenres: string[];
}

const userPreferencesSchema = new Schema(
  {
    audioQuality: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'LOSSLESS'],
      default: 'NORMAL',
    },
    explicitContent: { type: Boolean, default: true },
    language: { type: String, default: 'en-US' },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    preferredGenres: { type: [String], default: [] },
  },
  { _id: false }, // embedded sub-document — no separate _id
);

// ─── Profile document ─────────────────────────────────────────────────────────

export interface IProfile {
  /** Auth-service UUID — the cross-service identity key. */
  authId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  country?: string;
  bio?: string;
  provider: OAuthProvider;
  followerCount: number;
  followingCount: number;
  isVerifiedArtist: boolean;
  preferences: IUserPreferences;
}

export interface IProfileDocument extends IProfile, Document {}

const profileSchema = new Schema<IProfileDocument>(
  {
    authId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    avatarUrl: { type: String },
    country: { type: String, maxlength: 2 }, // ISO 3166-1 alpha-2
    bio: { type: String, maxlength: 300 },
    provider: {
      type: String,
      enum: ['GOOGLE', 'LOCAL'],
      required: true,
    },
    followerCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    isVerifiedArtist: { type: Boolean, default: false },
    preferences: {
      type: userPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
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

export const Profile: Model<IProfileDocument> = model<IProfileDocument>(
  'Profile',
  profileSchema,
);
