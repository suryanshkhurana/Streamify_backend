/**
 * set-s3-cors.ts
 * 
 * Applies a CORS policy to the S3 bucket so that browsers can PUT files
 * directly using presigned URLs (required for the profile picture upload flow).
 * 
 * Run once:  npx tsx set-s3-cors.ts
 */

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const s3 = new S3Client({
  region: process.env['AWS_REGION'] ?? 'ap-south-1',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
  },
});

const BUCKET = process.env['S3_BUCKET']!;

async function setCors() {
  console.log(`Setting CORS on bucket: ${BUCKET} ...`);

  await s3.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          // Allow browsers to PUT presigned profile pictures and GET any object
          AllowedOrigins: [
            'http://localhost:5173',    // Vite dev server
            'http://localhost:3000',    // API gateway (if used)
            'https://dpso6xwfx1woz.cloudfront.net', // CloudFront
          ],
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedHeaders: [
            'Content-Type',
            'Content-Length',
            'Authorization',
            'x-amz-*',
            'amz-sdk-*',
          ],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }));

  console.log('✅ CORS policy applied successfully!');
  console.log('');
  console.log('Allowed origins:');
  console.log('  • http://localhost:5173  (Vite dev server)');
  console.log('  • https://dpso6xwfx1woz.cloudfront.net  (CloudFront)');
  console.log('');
  console.log('Allowed methods: GET, PUT, HEAD');
}

setCors()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed to set CORS:', err);
    process.exit(1);
  });
