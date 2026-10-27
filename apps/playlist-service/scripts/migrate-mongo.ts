import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
const playlistSchema = new mongoose.Schema({}, { strict: false });
const Playlist = mongoose.model('Playlist', playlistSchema);

const likeSchema = new mongoose.Schema({}, { strict: false });
const Like = mongoose.model('Like', likeSchema);
import { logger } from '@streamify/shared-middleware';

const prisma = new PrismaClient();

async function migrate() {
  logger.info('[migrate] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI_PLAYLISTS as string);
  logger.info('[migrate] Connected to MongoDB.');

  logger.info('[migrate] Connecting to Postgres...');
  await prisma.$connect();
  logger.info('[migrate] Connected to Postgres.');

  // Migrate Playlists
  logger.info('[migrate] Starting Playlist migration...');
  const playlists = await Playlist.find({});
  for (const p of playlists) {
    await prisma.playlist.upsert({
      where: { id: p._id.toString() },
      update: {},
      create: {
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        ownerId: p.ownerId,
        isPublic: p.isPublic ?? true,
        tracks: p.tracks,
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date(),
      }
    });
  }
  logger.info(`[migrate] Migrated ${playlists.length} playlists.`);

  // Migrate Likes
  logger.info('[migrate] Starting Like migration...');
  const likes = await Like.find({});
  for (const l of likes) {
    const existing = await prisma.like.findFirst({
      where: { userId: l.userId, entityId: l.entityId, entityType: l.entityType }
    });
    if (!existing) {
      await prisma.like.create({
        data: {
          userId: l.userId,
          entityId: l.entityId,
          entityType: l.entityType,
          createdAt: l.createdAt || new Date()
        }
      });
    }
  }
  logger.info(`[migrate] Migrated ${likes.length} likes.`);

  logger.info('[migrate] Migration complete!');
  await mongoose.disconnect();
  await prisma.$disconnect();
}

migrate().catch(console.error);
