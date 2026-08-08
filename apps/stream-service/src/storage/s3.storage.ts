/**
 * S3 helpers for stream-service:
 *  - downloadToFile  : stream a raw audio file from S3 → local disk
 *  - uploadDirectory : upload all HLS files from local disk → S3
 */

import {
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { s3 } from '../config/s3.js';
import { env } from '../config/env.js';
import { logger } from '@streamify/shared-middleware';

/** Content-type map for HLS files */
const MIME: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
};

/**
 * Download an S3 object to a local file path.
 * Returns the local path so the caller knows where to find it.
 */
export async function downloadToFile(s3Key: string, localPath: string): Promise<string> {
  logger.info({ s3Key, localPath }, '[s3] downloading raw audio');

  const dir = path.dirname(localPath);
  fs.mkdirSync(dir, { recursive: true });

  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: s3Key }),
  );

  if (!Body) throw new Error(`[s3] Empty response body for key: ${s3Key}`);

  const writeStream = fs.createWriteStream(localPath);
  await pipeline(Body as Readable, writeStream);

  logger.info({ s3Key, localPath }, '[s3] download complete');
  return localPath;
}

/**
 * Upload all HLS segment and manifest files to S3.
 * Sets correct Content-Type and cache headers for CDN delivery.
 */
export async function uploadHlsFiles(
  files: Array<{ localPath: string; s3Key: string }>,
): Promise<void> {
  logger.info({ count: files.length }, '[s3] uploading HLS files');

  await Promise.all(
    files.map(async ({ localPath, s3Key }) => {
      const ext = path.extname(localPath);
      const contentType = MIME[ext] ?? 'application/octet-stream';
      const body = fs.readFileSync(localPath);

      await s3.send(
        new PutObjectCommand({
          Bucket: env.s3Bucket,
          Key: s3Key,
          Body: body,
          ContentType: contentType,
          // Allow CloudFront to cache segments for 1 year; manifests for 5 minutes
          CacheControl: ext === '.ts' ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
        }),
      );

      logger.debug({ s3Key }, '[s3] uploaded');
    }),
  );

  logger.info({ count: files.length }, '[s3] HLS upload complete');
}
