/**
 * MongoDB connection via Mongoose.
 *
 * Handles connect, disconnect, and logs connection events using Pino.
 */

import mongoose from 'mongoose';
import { logger } from '@streamify/shared-middleware';

const MONGODB_URI =
  process.env['MONGODB_URI'] || 'mongodb://mongodb:27017/streamify-users';

mongoose.connection.on('connected', () =>
  logger.info('[mongodb] connection established'),
);
mongoose.connection.on('error', (err: Error) =>
  logger.error({ err }, '[mongodb] connection error'),
);
mongoose.connection.on('disconnected', () =>
  logger.warn('[mongodb] disconnected'),
);

export async function connectDB(): Promise<void> {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
