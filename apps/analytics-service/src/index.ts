/**
 * analytics-service – internal only, no HTTP server exposed to the browser.
 * Consumes RabbitMQ events and writes to ClickHouse.
 */
import pino from 'pino';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const start = async (): Promise<void> => {
  logger.info('[analytics-service] starting…');

  // TODO Step 13: connect to ClickHouse and RabbitMQ
  // const clickhouse = createClient({ url: process.env['CLICKHOUSE_URL'] });
  // const connection = await amqplib.connect(process.env['RABBITMQ_URL'] ?? 'amqp://localhost');

  // Events to consume:
  //   - track.played       → insert into play_events table
  //   - search.performed   → insert into search_events table
  //   - user.registered    → insert into user_growth table

  logger.info('[analytics-service] ready – waiting for events');
};

start().catch((err) => {
  pino().error(err, '[analytics-service] fatal startup error');
  process.exit(1);
});
