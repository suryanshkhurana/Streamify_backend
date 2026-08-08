/**
 * RabbitMQ consumer for stream-service.
 *
 * Subscribes to:
 *   Queue: stream-service.track.uploaded
 *   Exchange: streamify.events
 *   Routing key: track.uploaded
 *
 * On message received:
 *   - Parses the TrackUploadedPayload
 *   - Hands off to runTranscodingPipeline()
 *   - ACKs on success, NACKs (with requeue=false) on failure so the message
 *     goes to a DLQ rather than spinning forever.
 *
 * Connection lifecycle:
 *   - Exponential backoff reconnection on error/close
 */

import amqp, { type Channel, type ConsumeMessage } from 'amqplib';
import { runTranscodingPipeline, type TrackUploadedPayload } from '../pipeline.js';
import { env } from '../config/env.js';
import { logger } from '@streamify/shared-middleware';

const EXCHANGE = 'streamify.events';
const EXCHANGE_TYPE = 'topic';
const QUEUE = 'stream-service.track.uploaded';
const ROUTING_KEY = 'track.uploaded';

let connection: any = null;
let channel: Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export async function startConsumer(): Promise<void> {
  try {
    connection = await amqp.connect(env.rabbitmqUrl);
    if (!connection) throw new Error('Failed to create amqp connection');
    channel = await connection.createChannel();
    if (!channel) throw new Error('Failed to create amqp channel');

    // Assert the exchange (idempotent)
    await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

    // Assert our durable queue
    await channel.assertQueue(QUEUE, {
      durable: true,
      arguments: {
        // Dead-letter exchange for failed messages
        'x-dead-letter-exchange': `${EXCHANGE}.dlq`,
      },
    });

    // Bind queue to routing key
    await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

    // Process one message at a time — transcoding is CPU-heavy
    channel.prefetch(1);

    logger.info({ queue: QUEUE }, '[rabbitmq:consumer] connected and listening');

    channel.consume(QUEUE, handleMessage(channel), { noAck: false });

    connection.on('error', (err: any) => {
      logger.error({ err }, '[rabbitmq:consumer] connection error — will reconnect');
      scheduleReconnect();
    });
    connection.on('close', () => {
      logger.warn('[rabbitmq:consumer] connection closed — will reconnect');
      scheduleReconnect();
    });
  } catch (err) {
    logger.error({ err }, '[rabbitmq:consumer] failed to connect');
    scheduleReconnect(5000);
  }
}

function handleMessage(ch: Channel) {
  return async (msg: ConsumeMessage | null): Promise<void> => {
    if (!msg) return;

    let payload: TrackUploadedPayload;

    try {
      const parsed = JSON.parse(msg.content.toString());
      // Handle wrapped event payloads like { event: 'track.uploaded', payload: { ... } }
      payload = (parsed.payload ? parsed.payload : parsed) as TrackUploadedPayload;
    } catch (parseErr) {
      logger.error({ parseErr, content: msg.content.toString() }, '[rabbitmq:consumer] invalid JSON — discarding');
      ch.nack(msg, false, false); // discard malformed messages
      return;
    }

    logger.info({ payload }, '[rabbitmq:consumer] received track.uploaded event');

    try {
      await runTranscodingPipeline(payload);
      ch.ack(msg);
      logger.info({ trackId: payload.trackId }, '[rabbitmq:consumer] message ACKed');
    } catch (pipelineErr) {
      logger.error({ pipelineErr, trackId: payload.trackId }, '[rabbitmq:consumer] pipeline error — NACKing');
      // Do not requeue; let the DLQ catch it
      ch.nack(msg, false, false);
    }
  };
}

function scheduleReconnect(delayMs = 3000): void {
  channel = null;
  connection = null;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startConsumer().catch((err) =>
      logger.error({ err }, '[rabbitmq:consumer] reconnect failed'),
    );
  }, delayMs);
}

export async function closeConsumer(): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try {
    await channel?.close();
    if (connection && typeof connection.close === 'function') await connection.close();
    logger.info('[rabbitmq:consumer] closed gracefully');
  } catch {
    // ignore
  }
}
