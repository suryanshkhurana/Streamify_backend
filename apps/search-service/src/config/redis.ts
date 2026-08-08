import Redis from 'ioredis';
import { logger } from '@streamify/shared-middleware';

export const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');

redis.on('connect', () => {
  logger.info('[redis] connected');
});

redis.on('error', (err) => {
  logger.error({ err }, '[redis] connection error');
});
