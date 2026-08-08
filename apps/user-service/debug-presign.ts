import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  console.log('--- Environment ---');
  console.log('S3_BUCKET:', process.env['S3_BUCKET']);
  console.log('AWS_REGION:', process.env['AWS_REGION']);
  console.log('AWS_ACCESS_KEY_ID:', process.env['AWS_ACCESS_KEY_ID']?.substring(0, 8) + '...');
  console.log('CLOUDFRONT_DOMAIN:', process.env['CLOUDFRONT_DOMAIN']);
  console.log('');

  const s3 = new S3Client({
    region: process.env['AWS_REGION'] ?? 'ap-south-1',
    credentials: {
      accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
    },
  });

  try {
    const cmd = new PutObjectCommand({
      Bucket: process.env['S3_BUCKET']!,
      Key: 'profile-pictures/debug-user/test-123.jpg',
      ContentType: 'image/jpeg',
      ContentLength: 1024,
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    console.log('--- SUCCESS ---');
    console.log('Presigned URL generated (first 150 chars):');
    console.log(url.substring(0, 150) + '...\n');

    // Now test that the URL host matches expected
    const urlObj = new URL(url);
    console.log('URL hostname:', urlObj.hostname);
    console.log('URL path starts with:', urlObj.pathname.substring(0, 40));
  } catch (err) {
    console.error('--- FAILED ---');
    console.error(err);
  }
}

main().then(() => process.exit(0));
