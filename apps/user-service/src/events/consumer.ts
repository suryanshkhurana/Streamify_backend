/**
 * RabbitMQ event consumer for the user-service.
 *
 * Exchange topology:
 *   Exchange: streamify.events  (type: topic, durable: true)
 *
 * Queues and bindings:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Queue                         │ Binding key    │ Handler             │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ user-service.user.registered  │ user.registered│ createProfile()     │
 * │ user-service.track.played     │ track.played   │ appendHistory()     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Each queue is durable and uses manual acknowledgement (noAck: false).
 * On a processing error the message is nacked without requeue to avoid
 * infinite loops; a dead-letter exchange should be wired in production.
 *
 * The consumer reconnects automatically via a simple exponential back-off
 * loop — losing the connection does not crash the service.
 */

import amqplib from 'amqplib';
import { logger } from '@streamify/shared-middleware';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import type {
  AnyStreamifyEvent,
  UserRegisteredPayload,
  TrackPlayedPayload,
} from '@streamify/shared-types';

import { upsertProfileFromEvent } from '../services/profile.service.js';
import { appendHistory } from '../services/history.service.js';
import { s3, S3_BUCKET } from '../config/s3.js';
import { PFP_CLEANUP_QUEUE } from '../events/publisher.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const EXCHANGE_NAME = 'streamify.events';
const EXCHANGE_TYPE = 'topic';
const RABBITMQ_URL =
  process.env['RABBITMQ_URL'] ??
  'amqp://streamify:streamify_dev_password@localhost:5672';

const QUEUES = {
  USER_REGISTERED: 'user-service.user.registered',
  TRACK_PLAYED: 'user-service.track.played',
} as const;

/** Safety prefix — cleanup worker will REFUSE to delete any key outside this path. */
const PFP_KEY_SAFE_PREFIX = 'profile-pictures/';

/** Max retry attempts before nacking the cleanup message to DLX. */
const PFP_CLEANUP_MAX_RETRIES = 3;

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleUserRegistered(payload: UserRegisteredPayload): Promise<void> {
  logger.info(
    { authId: payload.authId, email: payload.email },
    '[consumer] user.registered — creating profile',
  );

  await upsertProfileFromEvent({
    authId: payload.authId,
    email: payload.email,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
    provider: payload.provider,
  });

  logger.info({ authId: payload.authId }, '[consumer] profile upserted');
}

async function handleTrackPlayed(payload: TrackPlayedPayload): Promise<void> {
  logger.info(
    { userId: payload.userId, trackId: payload.trackId },
    '[consumer] track.played — appending history',
  );

  await appendHistory(payload);
}

// ─── Message router ───────────────────────────────────────────────────────────

async function dispatch(routingKey: string, event: AnyStreamifyEvent): Promise<void> {
  switch (routingKey) {
    case 'user.registered':
      await handleUserRegistered(event.payload as UserRegisteredPayload);
      break;
    case 'track.played':
      await handleTrackPlayed(event.payload as TrackPlayedPayload);
      break;
    default:
      logger.warn({ routingKey }, '[consumer] unhandled routing key — skipping');
  }
}

// ─── Consumer setup ───────────────────────────────────────────────────────────

async function createConsumer(): Promise<void> {
  const connection = await amqplib.connect(RABBITMQ_URL);
  logger.info('[rabbitmq:consumer] connected');

  // On error / unexpected close — reconnect after delay
  connection.on('error', (err: Error) => {
    logger.error({ err }, '[rabbitmq:consumer] connection error — will reconnect');
    void scheduleReconnect();
  });

  connection.on('close', () => {
    logger.warn('[rabbitmq:consumer] connection closed — will reconnect');
    void scheduleReconnect();
  });

  const channel = await connection.createChannel();

  // One message at a time per consumer — prevents cascade failures
  await channel.prefetch(1);

  // Assert the shared topic exchange
  await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

  // ── Queue: user.registered ──────────────────────────────────────────────────
  await channel.assertQueue(QUEUES.USER_REGISTERED, {
    durable: true,
    arguments: {
      // Dead-letter exchange for unprocessable messages (configure in prod)
      'x-dead-letter-exchange': 'streamify.dlx',
    },
  });
  await channel.bindQueue(QUEUES.USER_REGISTERED, EXCHANGE_NAME, 'user.registered');

  // ── Queue: track.played ─────────────────────────────────────────────────────
  await channel.assertQueue(QUEUES.TRACK_PLAYED, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'streamify.dlx',
    },
  });
  await channel.bindQueue(QUEUES.TRACK_PLAYED, EXCHANGE_NAME, 'track.played');

  // ── Shared message handler ──────────────────────────────────────────────────
  const onMessage = async (
    msg: amqplib.ConsumeMessage | null,
    queueName: string,
  ): Promise<void> => {
    if (!msg) return; // Consumer cancelled

    const routingKey = msg.fields.routingKey;

    try {
      const raw = msg.content.toString('utf-8');
      const event = JSON.parse(raw) as AnyStreamifyEvent;

      await dispatch(routingKey, event);

      channel.ack(msg);
    } catch (err) {
      logger.error(
        { err, routingKey, queue: queueName },
        '[consumer] message processing failed — nacking without requeue',
      );
      // nack without requeue — sends to DLX in production
      channel.nack(msg, false, false);
    }
  };

  await channel.consume(
    QUEUES.USER_REGISTERED,
    (msg) => void onMessage(msg, QUEUES.USER_REGISTERED),
    { noAck: false },
  );

  await channel.consume(
    QUEUES.TRACK_PLAYED,
    (msg) => void onMessage(msg, QUEUES.TRACK_PLAYED),
    { noAck: false },
  );

  // ── Profile picture cleanup worker ────────────────────────────────────────────
  await channel.assertQueue(PFP_CLEANUP_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': 'streamify.dlx' },
  });

  await channel.consume(
    PFP_CLEANUP_QUEUE,
    async (msg) => {
      if (!msg) return;

      let s3Key = '';
      let authId = '';

      try {
        const body = JSON.parse(msg.content.toString('utf-8')) as {
          s3Key: string;
          authId: string;
        };

        s3Key = body.s3Key ?? '';
        authId = body.authId ?? '';

        // ── HARD safety guard ──────────────────────────────────────────────────
        // Refuse to delete ANYTHING outside profile-pictures/{authId}/
        const safePrefix = `${PFP_KEY_SAFE_PREFIX}${authId}/`;
        if (!s3Key || !authId || !s3Key.startsWith(safePrefix)) {
          logger.error(
            { s3Key, authId, safePrefix },
            '[pfp:cleanup] BLOCKED — key is outside the allowed prefix. Discarding message.',
          );
          // nack without requeue: this message should never be retried
          channel.nack(msg, false, false);
          return;
        }

        // ── Retry loop ────────────────────────────────────────────────────────────
        let lastErr: unknown;
        for (let attempt = 1; attempt <= PFP_CLEANUP_MAX_RETRIES; attempt++) {
          try {
            await s3.send(
              new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }),
            );
            logger.info(
              { s3Key, authId, attempt },
              '[pfp:cleanup] old profile picture deleted from S3',
            );
            channel.ack(msg);
            return; // success — exit the handler
          } catch (err) {
            lastErr = err;
            const backoffMs = attempt * 500;
            logger.warn(
              { err, s3Key, attempt, backoffMs },
              '[pfp:cleanup] S3 delete failed — retrying after backoff',
            );
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }

        // All retries exhausted — send to DLX
        logger.error(
          { err: lastErr, s3Key, authId },
          '[pfp:cleanup] all retries exhausted — nacking to DLX',
        );
        channel.nack(msg, false, false);
      } catch (parseErr) {
        logger.error(
          { err: parseErr, s3Key, authId },
          '[pfp:cleanup] failed to parse cleanup message — discarding',
        );
        channel.nack(msg, false, false);
      }
    },
    { noAck: false },
  );

  logger.info(
    { queues: Object.values(QUEUES) },
    '[rabbitmq:consumer] subscriptions active',
  );
}

// ─── Reconnect loop ───────────────────────────────────────────────────────────

let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectDelay = 2_000; // start at 2 s, doubles up to 30 s
const MAX_RECONNECT_DELAY = 30_000;

async function scheduleReconnect(): Promise<void> {
  if (_reconnectTimer) return; // already scheduled

  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    try {
      await createConsumer();
      _reconnectDelay = 2_000; // reset back-off on success
    } catch (err) {
      logger.error(
        { err, nextRetryMs: _reconnectDelay },
        '[rabbitmq:consumer] reconnect failed — retrying',
      );
      _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY);
      void scheduleReconnect();
    }
  }, _reconnectDelay);

  logger.info(
    { delayMs: _reconnectDelay },
    '[rabbitmq:consumer] scheduled reconnect',
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Connect to RabbitMQ and start consuming events.
 * Non-fatal: if RabbitMQ is not yet available the service still starts;
 * reconnection is retried with exponential back-off.
 */
export async function startConsumer(): Promise<void> {
  try {
    await createConsumer();
  } catch (err) {
    logger.warn(
      { err },
      '[rabbitmq:consumer] initial connection failed — will retry in background',
    );
    void scheduleReconnect();
  }
}
