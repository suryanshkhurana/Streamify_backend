/**
 * notification-service – internal only, no HTTP server exposed to the browser.
 * Connects to RabbitMQ and listens for events to send email / push notifications.
 */
import pino from 'pino';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const start = async (): Promise<void> => {
  logger.info('[notification-service] starting…');

  // TODO Step 11: connect to RabbitMQ and register event consumers
  // const connection = await amqplib.connect(process.env['RABBITMQ_URL'] ?? 'amqp://localhost');
  // const channel = await connection.createChannel();
  // await channel.assertExchange('streamify', 'topic', { durable: true });

  // Consumers to implement:
  //   - user.registered  → sendWelcomeEmail()
  //   - user.followed    → sendFollowPushNotification()
  //   - artist.new_release → sendNewReleaseBroadcast()

  logger.info('[notification-service] ready – waiting for events');
};

start().catch((err) => {
  pino().error(err, '[notification-service] fatal startup error');
  process.exit(1);
});
