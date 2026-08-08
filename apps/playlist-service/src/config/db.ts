/**
 * src/config/db.ts
 * MongoDB connection bootstrap using Mongoose.
 */

import mongoose from 'mongoose';
import { logger } from '@streamify/shared-middleware';

export async function connectDB(): Promise<void> {
  const uri =
    process.env['MONGODB_URI'] || 'mongodb://mongodb:27017/streamify-playlists';

  mongoose.connection.on('connected', () =>
    logger.info('[playlist-service] MongoDB connected'),
  );
  mongoose.connection.on('error', (err) =>
    logger.error({ err }, '[playlist-service] MongoDB error'),
  );
  mongoose.connection.on('disconnected', () =>
    logger.warn('[playlist-service] MongoDB disconnected'),
  );

  await mongoose.connect(uri);
}
