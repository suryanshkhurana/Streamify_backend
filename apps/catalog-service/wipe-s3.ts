import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function wipeS3() {
  console.log('--- Wiping S3 Bucket ---');
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    console.log('No S3_BUCKET found in .env, skipping S3 wipe.');
    return;
  }

  const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  let isTruncated = true;
  let continuationToken: string | undefined = undefined;
  let deletedCount = 0;

  try {
    while (isTruncated) {
      const listRes = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }));

      if (listRes.Contents && listRes.Contents.length > 0) {
        await s3.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: listRes.Contents.map(c => ({ Key: c.Key })),
          },
        }));
        deletedCount += listRes.Contents.length;
        console.log(`Deleted ${deletedCount} objects from ${bucket}...`);
      }
      isTruncated = listRes.IsTruncated ?? false;
      continuationToken = listRes.NextContinuationToken;
    }
    console.log(`Successfully wiped S3 Bucket: ${bucket}`);
  } catch (err) {
    console.error('Failed to wipe S3 bucket:', err);
  }
}

wipeS3().then(() => process.exit(0));
