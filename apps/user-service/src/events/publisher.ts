/**
 * RabbitMQ event publisher for the user-service.
 *
 * Exchange topology (same exchange as all other services):
 *   Exchange: streamify.events  (type: topic, durable: true)
 *
 * Events published by this service:
 *   Routing key: user.followed
 *   Payload: UserFollowedPayload
 *
 * Connection is a lazy singleton — established on first publish.
 * Errors are non-fatal; the HTTP action already succeeded by the time
 * we publish, so a failed event is logged but not re-thrown.
 */

import amqplib from 'amqplib';
import { logger } from '@streamify/shared-middleware';
import type {
  FollowTargetType,
  UserFollowedEvent,
  UserFollowedPayload,
} from '@streamify/shared-types';

// ─── Config ───────────────────────────────────────────────────────────────────

const EXCHANGE_NAME = 'streamify.events';
const EXCHANGE_TYPE = 'topic';
const RABBITMQ_URL =
  process.env['RABBITMQ_URL'] ??
  'amqp://streamify:streamify_dev_password@localhost:5672';

/** Dedicated work-queue for old profile picture S3 cleanup tasks. */
export const PFP_CLEANUP_QUEUE = 'user-service.pfp.cleanup';

// ─── Singleton state ─────────────────────────────────────────────────────────

let _channel: amqplib.Channel | null = null;

// ─── Connection management ────────────────────────────────────────────────────

async function getChannel(): Promise<amqplib.Channel> {
  if (_channel) return _channel;

  const connection = await amqplib.connect(RABBITMQ_URL);
  logger.info('[rabbitmq:publisher] connected');

  connection.on('error', (err: Error) => {
    logger.error({ err }, '[rabbitmq:publisher] connection error');
    _channel = null;
  });

  connection.on('close', () => {
    logger.warn('[rabbitmq:publisher] connection closed');
    _channel = null;
  });

  _channel = await connection.createChannel();
  await _channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });
  logger.info(`[rabbitmq:publisher] exchange "${EXCHANGE_NAME}" asserted`);

  return _channel;
}

// ─── Publishers ───────────────────────────────────────────────────────────────

/**
 * Publish a user.followed event.
 *
 * Consumed by:
 *   - notification-service → sends "X started following you" push notification
 */
export async function publishUserFollowed(payload: {
  followerId: string;
  followerDisplayName: string;
  followedId: string;
  targetType: FollowTargetType;
}): Promise<void> {
  const event: UserFollowedEvent = {
    type: 'user.followed',
    payload: {
      followerId: payload.followerId,
      followerDisplayName: payload.followerDisplayName,
      followedId: payload.followedId,
      targetType: payload.targetType,
      followedAt: new Date().toISOString(),
    } satisfies UserFollowedPayload,
    occurredAt: new Date().toISOString(),
  };

  try {
    const ch = await getChannel();
    ch.publish(
      EXCHANGE_NAME,
      'user.followed',
      Buffer.from(JSON.stringify(event)),
      {
        contentType: 'application/json',
        persistent: true,
        messageId: `${payload.followerId}-${payload.followedId}-${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1_000),
      },
    );

    logger.info(
      { followerId: payload.followerId, followedId: payload.followedId },
      '[rabbitmq:publisher] user.followed event published',
    );
  } catch (err) {
    // Non-fatal — the follow DB write succeeded; event loss is acceptable
    // in the absence of an outbox pattern at this stage.
    logger.error(
      { err, followerId: payload.followerId },
      '[rabbitmq:publisher] failed to publish user.followed event',
    );
  }
}

// ─── Profile picture cleanup publisher ───────────────────────────────────────

/**
 * Enqueue an old profile picture S3 key for async deletion.
 *
 * Uses a simple durable work-queue (no exchange routing) so the cleanup
 * worker pulls tasks one-at-a-time with manual ack and retry logic.
 */
export async function publishPfpCleanup(payload: {
  s3Key: string;
  authId: string;
}): Promise<void> {
  try {
    const ch = await getChannel();

    // Assert the queue here too so publish never fails on a missing queue
    await ch.assertQueue(PFP_CLEANUP_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'streamify.dlx' },
    });

    const message = Buffer.from(
      JSON.stringify({ ...payload, enqueuedAt: new Date().toISOString() }),
    );

    ch.sendToQueue(PFP_CLEANUP_QUEUE, message, {
      contentType: 'application/json',
      persistent: true, // survives broker restart
      messageId: `pfp-cleanup-${payload.authId}-${Date.now()}`,
    });

    logger.info(
      { s3Key: payload.s3Key, authId: payload.authId },
      '[rabbitmq:publisher] pfp cleanup task enqueued',
    );
  } catch (err) {
    logger.error(
      { err, s3Key: payload.s3Key },
      '[rabbitmq:publisher] failed to enqueue pfp cleanup task',
    );
    throw err; // re-throw so the caller can log a warning
  }
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

export async function closePublisher(): Promise<void> {
  if (_channel) {
    await _channel.close();
    _channel = null;
  }
  logger.info('[rabbitmq:publisher] channel closed gracefully');
}
