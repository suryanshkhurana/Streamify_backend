/**
 * RabbitMQ event publisher for the catalog-service.
 *
 * Exchange topology:
 *   Exchange: streamify.events  (type: topic, durable: true)
 *
 * Events published by this service:
 *   Routing key: track.uploaded
 *   Payload: TrackUploadedPayload
 *
 *   Routing key: track.status.updated
 *   Payload: { trackId, status, artistId }
 */

import amqplib from 'amqplib';
import { logger } from '@streamify/shared-middleware';

// ─── Config ───────────────────────────────────────────────────────────────────

const EXCHANGE_NAME = 'streamify.events';
const EXCHANGE_TYPE = 'topic';

// ─── Singleton state ─────────────────────────────────────────────────────────

let channel: amqplib.Channel | null = null;

// ─── Connection management ────────────────────────────────────────────────────

async function getChannel(): Promise<amqplib.Channel> {
  if (channel) { return channel; }

  const url =
    process.env['RABBITMQ_URL'] ??
    'amqp://streamify:streamify_dev_password@localhost:5672';

  const connection = await amqplib.connect(url);
  logger.info('[rabbitmq:publisher] connected');

  connection.on('error', (err: Error) => {
    logger.error({ err }, '[rabbitmq:publisher] connection error');
    channel = null;
  });

  connection.on('close', () => {
    logger.warn('[rabbitmq:publisher] connection closed');
    channel = null;
  });

  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });
  logger.info(`[rabbitmq:publisher] exchange "${EXCHANGE_NAME}" asserted`);

  return channel;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function publish(routingKey: string, payload: unknown): void {
  void (async () => {
    try {
      const ch = await getChannel();
      const event = {
        type: routingKey,
        payload,
        occurredAt: new Date().toISOString(),
      };
      const content = Buffer.from(JSON.stringify(event));
      ch.publish(EXCHANGE_NAME, routingKey, content, {
        contentType: 'application/json',
        persistent: true,
        timestamp: Math.floor(Date.now() / 1000),
      });
      logger.info({ routingKey }, `[rabbitmq:publisher] ${routingKey} published`);
    } catch (err) {
      logger.error({ err, routingKey }, '[rabbitmq:publisher] Failed to publish event');
    }
  })();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publish track.uploaded event.
 * Consumed by:
 *  - search-service        → indexes track in Elasticsearch
 *  - notification-service  → notifies followers of the artist
 *  - analytics-service     → records new content event
 */
export function publishTrackUploaded(payload: {
  trackId: string;
  artistId: string;
  albumId: string | null;
  title: string;
  genres: string[];
  s3Key: string;
  uploadedAt: string;
}): void {
  publish('track.uploaded', payload);
}

/**
 * Publish track.status.updated event.
 * Consumed by stream-service once transcoding is complete.
 */
export function publishTrackStatusUpdated(payload: {
  trackId: string;
  artistId: string;
  status: string;
  s3KeyHls?: string;
}): void {
  publish('track.status.updated', payload);
}

/**
 * Publish track.deleted event.
 * Consumed by search-service to remove the track from Elasticsearch.
 */
export function publishTrackDeleted(payload: { trackId: string }): void {
  publish('track.deleted', payload);
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

export async function closeRabbitMQ(): Promise<void> {
  if (channel) {
    await channel.close();
    channel = null;
  }
  logger.info('[rabbitmq:publisher] channel closed gracefully');
}
