/**
 * Centralised environment configuration for stream-service.
 * Throws at startup if any required variable is missing — fail-fast pattern.
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[stream-service] Missing required env var: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: parseInt(optionalEnv('PORT', '3004'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),

  // AWS S3
  s3Bucket: optionalEnv('S3_BUCKET', 'streamify-music-storage'),
  awsRegion: optionalEnv('AWS_REGION', 'ap-south-1'),
  awsAccessKeyId: optionalEnv('AWS_ACCESS_KEY_ID', ''),
  awsSecretAccessKey: optionalEnv('AWS_SECRET_ACCESS_KEY', ''),

  // AWS CloudFront — optional in dev (signed URL endpoint will return S3 URL instead)
  cloudfrontDomain: optionalEnv('CLOUDFRONT_DOMAIN', ''),
  cloudfrontKeyPairId: optionalEnv('CLOUDFRONT_KEY_PAIR_ID', ''),
  cloudfrontPrivateKey: optionalEnv('CLOUDFRONT_PRIVATE_KEY', ''), // base64-encoded PEM

  // RabbitMQ
  rabbitmqUrl: requireEnv('RABBITMQ_URL'),

  // Catalog service internal base URL (for updating track status)
  catalogServiceUrl: optionalEnv('CATALOG_SERVICE_URL', 'http://localhost:3003'),

  // JWT — needed to call catalog-service's internal patch endpoint
  jwtSecret: requireEnv('JWT_SECRET'),

  // Local temp directory for FFmpeg work files
  tmpDir: optionalEnv('TMP_DIR', '/tmp/streamify'),
} as const;
