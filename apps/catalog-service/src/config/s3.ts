/**
 * AWS S3 client singleton for catalog-service.
 * Used to generate presigned upload URLs for audio track files.
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

export const S3_BUCKET = process.env['S3_BUCKET'] ?? 'streamify-audio';
