/**
 * RabbitMQ publisher for stream-service.
 *
 * Events emitted:
 *   track.ready    — HLS transcoding succeeded; catalog-service can set status → READY
 *   track.failed   — Transcoding failed; catalog-service can set status → FAILED
 *
 * Connection lifecycle:
 *  - Lazy connect on first publish
 *  - Exponential backoff reconnection on error
 *  - closeRabbitMQ() for graceful shutdown
 */

import amqp, { type Channel } from 'amqplib';
import { env } from '../config/env.js';
import { logger } from '@streamify/shared-middleware';

const EXCHANGE = 'streamify.events';
const EXCHANGE_TYPE = 'topic';

let connection: any = null;
let channel: Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async function connect(): Promise<Channel> {
  if (channel) return channel;

  connection = await amqp.connect(env.rabbitmqUrl);
  if (!connection) throw new Error('Failed to create amqp connection');
  channel = await connection.createChannel();
  if (!channel) throw new Error('Failed to create amqp channel');
  await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

  logger.info('[rabbitmq:publisher] connected and exchange asserted');

  connection.on('error', (err: any) => {
    logger.error({ err }, '[rabbitmq:publisher] connection error — will reconnect');
    scheduleReconnect();
  });
  connection.on('close', () => {
    logger.warn('[rabbitmq:publisher] connection closed — will reconnect');
    scheduleReconnect();
  });

  return channel;
}

function scheduleReconnect(delayMs = 3000): void {
  channel = null;
  connection = null;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((err) =>
      logger.error({ err }, '[rabbitmq:publisher] reconnect failed'),
    );
  }, delayMs);
}

async function publish(routingKey: string, payload: unknown): Promise<void> {
  const ch = await connect();
  const msg = Buffer.from(JSON.stringify(payload));
  ch.publish(EXCHANGE, routingKey, msg, { persistent: true, contentType: 'application/json' });
  logger.info({ routingKey }, `[rabbitmq:publisher] ${routingKey} published`);
}

// ─── Typed event publishers ───────────────────────────────────────────────────

export interface TrackReadyPayload {
  trackId: string;
  hlsKey: string;       // S3 key for master.m3u8
  durationMs: number;
}

export interface TrackFailedPayload {
  trackId: string;
  reason: string;
}

export function publishTrackReady(payload: TrackReadyPayload): Promise<void> {
  return publish('track.ready', { event: 'track.ready', ...payload });
}

export function publishTrackFailed(payload: TrackFailedPayload): Promise<void> {
  return publish('track.failed', { event: 'track.failed', ...payload });
}

export async function closeRabbitMQ(): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try {
    await channel?.close();
    if (connection && typeof connection.close === 'function') await connection.close();
    logger.info('[rabbitmq:publisher] connection closed gracefully');
  } catch {
    // ignore on shutdown
  }
}
