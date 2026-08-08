/**
 * S3 client config for the user-service.
 *
 * Reuses the same AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * environment variables used by catalog-service and stream-service.
 * No new infrastructure is introduced.
 */

import { S3Client } from '@aws-sdk/client-s3';

const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-south-1';

export const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
  },
});

export const S3_BUCKET = process.env['S3_BUCKET'] ?? 'streamify-music-storage';

/**
 * CloudFront base URL (e.g. https://abc123.cloudfront.net).
 * Falls back to a direct S3 URL pattern if not configured.
 */
export const CLOUDFRONT_BASE =
  process.env['CLOUDFRONT_DOMAIN']?.replace(/\/$/, '') ??
  `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

/** Build a public CloudFront URL for a given S3 key. */
export function cfUrl(s3Key: string): string {
  return `${CLOUDFRONT_BASE}/${s3Key}`;
}
