/**
 * RabbitMQ event publisher for the auth-service.
 *
 * Exchange topology:
 *   Exchange: streamify.events  (type: topic, durable: true)
 *
 * Events published by this service:
 *   Routing key: user.registered
 *   Payload: UserRegisteredPayload
 */

import amqplib from 'amqplib';

import { logger } from '@streamify/shared-middleware';
import type {
  OAuthProvider,
  UserRegisteredEvent,
  UserRegisteredPayload,
} from '@streamify/shared-types';

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
  logger.info('[rabbitmq] connected');

  // Listen for connection-level errors
  connection.on('error', (err: Error) => {
    logger.error({ err }, '[rabbitmq] connection error');
    channel = null;
  });

  connection.on('close', () => {
    logger.warn('[rabbitmq] connection closed');
    channel = null;
  });

  channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

  logger.info(`[rabbitmq] exchange "${EXCHANGE_NAME}" asserted`);

  return channel;
}

// ─── Publisher ────────────────────────────────────────────────────────────────

/**
 * Publishes a user.registered event to RabbitMQ.
 *
 * Consumed by:
 *  - user-service          -> creates a MongoDB profile document
 *  - notification-service  -> sends a welcome email
 */
export async function publishUserRegistered(payload: {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  provider: OAuthProvider;
}): Promise<void> {
  const event: UserRegisteredEvent = {
    type: 'user.registered',
    payload: {
      userId: payload.userId,
      authId: payload.userId,
      email: payload.email,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      provider: payload.provider,
      registeredAt: new Date().toISOString(),
    } satisfies UserRegisteredPayload,
    occurredAt: new Date().toISOString(),
  };

  try {
    const ch = await getChannel();
    const content = Buffer.from(JSON.stringify(event));

    ch.publish(EXCHANGE_NAME, 'user.registered', content, {
      contentType: 'application/json',
      persistent: true,
      messageId: event.payload.userId,
      timestamp: Math.floor(Date.now() / 1000),
    });

    logger.info(
      { userId: payload.userId },
      '[rabbitmq] user.registered event published',
    );
  } catch (err) {
    // Non-fatal: registration succeeded; event can be replayed later
    logger.error({ err, userId: payload.userId }, '[rabbitmq] Failed to publish user.registered event');
  }
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

export async function closeRabbitMQ(): Promise<void> {
  if (channel) {
    await channel.close();
    channel = null;
  }
  logger.info('[rabbitmq] channel closed gracefully');
}
