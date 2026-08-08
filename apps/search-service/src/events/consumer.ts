import amqplib from 'amqplib';
import { logger } from '@streamify/shared-middleware';
import { esClient } from '../config/elasticsearch.js';

const EXCHANGE_NAME = 'streamify.events';
const QUEUE_NAME = 'search_service_indexer';

let channel: amqplib.Channel | null = null;

export async function initRabbitMQ(): Promise<void> {
  const url = process.env['RABBITMQ_URL'] ?? 'amqp://streamify:streamify_dev_password@localhost:5672';
  
  try {
    const connection = await amqplib.connect(url);
    channel = await connection.createChannel();
    
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    // Bind to the events specified by the requirements
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'track.ready');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'artist.updated');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'track.status.updated');
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'track.deleted');

    logger.info(`[rabbitmq:consumer] listening on queue "${QUEUE_NAME}"`);

    channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      try {
        const event = JSON.parse(msg.content.toString());
        const { type, payload } = event;

        if (type === 'track.ready' || type === 'track.status.updated') {
          // If the status is READY, we index or update the track
          if (payload.status === 'READY') {
            await esClient.index({
              index: 'tracks',
              id: payload.trackId,
              body: {
                id: payload.trackId,
                title: payload.title ?? '', // Fallbacks in case payload is partial
                artistName: payload.artistName ?? '',
                albumTitle: payload.albumTitle ?? '',
                coverUrl: payload.coverUrl ?? '',
                durationMs: payload.durationMs ?? 0,
              },
            });
            logger.info(`[elasticsearch] Indexed track ${payload.trackId}`);
          }
        } else if (type === 'artist.updated') {
          await esClient.index({
            index: 'artists',
            id: payload.artistId,
            body: {
              id: payload.artistId,
              name: payload.name,
              avatarUrl: payload.avatarUrl,
            },
          });
          logger.info(`[elasticsearch] Indexed/Updated artist ${payload.artistId}`);
          
          await esClient.updateByQuery({
            index: 'tracks',
            body: {
              query: { match: { artistId: payload.artistId } },
              script: {
                source: 'ctx._source.artistName = params.name',
                params: { name: payload.name }
              }
            }
          });
        } else if (type === 'track.deleted') {
          await esClient.delete({
            index: 'tracks',
            id: payload.trackId,
          });
          logger.info(`[elasticsearch] Deleted track ${payload.trackId}`);
        }

        channel!.ack(msg);
      } catch (err) {
        logger.error({ err }, '[rabbitmq:consumer] Failed to process message');
        // Nack without requeue to prevent infinite loops on malformed messages
        channel!.nack(msg, false, false);
      }
    });
  } catch (err) {
    logger.error({ err }, '[rabbitmq:consumer] Failed to connect');
  }
}
