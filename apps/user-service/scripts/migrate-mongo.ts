import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
const profileSchema = new mongoose.Schema({}, { strict: false });
const Profile = mongoose.model('Profile', profileSchema);

const followSchema = new mongoose.Schema({}, { strict: false });
const Follow = mongoose.model('Follow', followSchema);

const historySchema = new mongoose.Schema({}, { strict: false });
const ListeningHistory = mongoose.model('ListeningHistory', historySchema);

import { logger } from '@streamify/shared-middleware';

const prisma = new PrismaClient();

async function migrate() {
  logger.info('[migrate] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI_USERS as string);
  logger.info('[migrate] Connected to MongoDB.');

  logger.info('[migrate] Connecting to Postgres...');
  await prisma.$connect();
  logger.info('[migrate] Connected to Postgres.');

  // Migrate Profiles
  logger.info('[migrate] Starting Profile migration...');
  const profiles = await Profile.find({});
  for (const p of profiles) {
    await prisma.profile.upsert({
      where: { authId: p.authId },
      update: {},
      create: {
        authId: p.authId,
        email: p.email,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        country: p.country,
        bio: p.bio,
        provider: p.provider,
        followerCount: p.followerCount,
        followingCount: p.followingCount,
        isVerifiedArtist: p.isVerifiedArtist,
        audioQuality: p.preferences?.audioQuality || 'NORMAL',
        explicitContent: p.preferences?.explicitContent ?? true,
        language: p.preferences?.language || 'en-US',
        emailNotifications: p.preferences?.emailNotifications ?? true,
        pushNotifications: p.preferences?.pushNotifications ?? true,
        preferredGenres: p.preferences?.preferredGenres || [],
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date(),
      }
    });
  }
  logger.info(`[migrate] Migrated ${profiles.length} profiles.`);

  // Migrate Follows
  logger.info('[migrate] Starting Follow migration...');
  const follows = await Follow.find({});
  for (const f of follows) {
    // Avoid unique constraint errors if running multiple times
    const existing = await prisma.follow.findFirst({
      where: { followerId: f.followerId, followingId: f.followingId }
    });
    if (!existing) {
      await prisma.follow.create({
        data: {
          followerId: f.followerId,
          followingId: f.followingId,
          createdAt: f.createdAt || new Date()
        }
      });
    }
  }
  logger.info(`[migrate] Migrated ${follows.length} follows.`);

  // Migrate Listening History
  logger.info('[migrate] Starting ListeningHistory migration...');
  const history = await ListeningHistory.find({});
  // Use createMany for speed if there are a lot, but upsert isn't possible without a unique ID mapping.
  // We'll just insert them if the table is empty for safety.
  const historyCount = await prisma.listeningHistory.count();
  if (historyCount === 0) {
    const historyData = history.map(h => ({
      userId: h.userId,
      trackId: h.trackId,
      playedAt: h.playedAt || new Date(),
      context: h.context
    }));
    if (historyData.length > 0) {
      await prisma.listeningHistory.createMany({ data: historyData });
    }
    logger.info(`[migrate] Migrated ${history.length} listening history records.`);
  } else {
    logger.info('[migrate] ListeningHistory table not empty, skipping to prevent duplicates.');
  }

  logger.info('[migrate] Migration complete!');
  await mongoose.disconnect();
  await prisma.$disconnect();
}

migrate().catch(console.error);
