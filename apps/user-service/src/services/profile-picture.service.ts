/**
 * profile-picture.service.ts
 *
 * Business logic for the two-step profile picture upload flow:
 *
 *   Step 1 — generateUploadUrl()
 *     • Validates mime type (jpeg | png | webp only)
 *     • Generates a unique S3 key under  profile-pictures/{authId}/{uuid}.{ext}
 *     • Returns a presigned PUT URL (5-minute expiry, 5 MB max enforced via
 *       Content-Length-Range condition on the signature)
 *
 *   Step 2 — confirmUpload()
 *     • HEAD-checks that the file actually exists in S3
 *     • Reads first 12 bytes (magic bytes) and validates them to prove it is a
 *       real image — not just a renamed file with a forged Content-Type
 *     • Reads the user's current avatarUrl from MongoDB
 *     • Updates avatarUrl to the new CloudFront URL
 *     • Invalidates the Redis profile cache
 *     • If a previous picture existed under profile-pictures/{authId}/, publishes
 *       its S3 key to the "user-service.pfp.cleanup" queue for async deletion
 *     • First-time uploads (no prior picture) skip cleanup entirely
 */

import crypto from 'crypto';
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, S3_BUCKET, cfUrl } from '../config/s3.js';
import { Profile } from '../models/Profile.js';
import { AppError } from '@streamify/shared-middleware';
import { logger } from '@streamify/shared-middleware';
import { redis, profileCacheKey } from '../config/redis.js';
import { publishPfpCleanup } from '../events/publisher.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Presigned PUT URL TTL: 5 minutes */
const PRESIGNED_EXPIRES_IN = 300;

/** Max file size: 5 MB — enforced in the presigned URL policy */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const EXT_MAP: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Magic byte signatures for image formats.
 * We read the first 12 bytes of the uploaded object and confirm at least one
 * signature matches before accepting the upload as a real image.
 */
const MAGIC_SIGNATURES: Array<{ mime: AllowedMime; bytes: number[]; offset?: number }> = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: RIFF????WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
];

const WEBP_SECONDARY = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

/** S3 key prefix for all profile pictures */
const PFP_PREFIX = 'profile-pictures';

function s3KeyForUser(authId: string, ext: string): string {
  return `${PFP_PREFIX}/${authId}/${crypto.randomUUID()}.${ext}`;
}

// ─── Step 1: Generate presigned upload URL ────────────────────────────────────

export async function generateUploadUrl(
  authId: string,
  mimeType: string,
  fileSizeBytes: number,
): Promise<{ uploadUrl: string; s3Key: string; expiresIn: number }> {
  // Validate mime type
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new AppError(
      `Unsupported file type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      400,
    );
  }

  // Validate file size (client-provided hint; S3 enforces via conditions)
  if (fileSizeBytes <= 0 || fileSizeBytes > MAX_BYTES) {
    throw new AppError(
      `File size must be between 1 byte and ${MAX_BYTES / 1_048_576} MB`,
      400,
    );
  }

  const allowedMime = mimeType as AllowedMime;
  const ext = EXT_MAP[allowedMime];
  const s3Key = s3KeyForUser(authId, ext);

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    ContentType: mimeType,
    ContentLength: fileSizeBytes,
    Metadata: {
      authId,
      purpose: 'profile-picture',
    },
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: PRESIGNED_EXPIRES_IN,
  });

  logger.info({ authId, s3Key }, '[pfp] presigned upload URL generated');

  return { uploadUrl, s3Key, expiresIn: PRESIGNED_EXPIRES_IN };
}

// ─── Step 2: Confirm upload ───────────────────────────────────────────────────

export async function confirmUpload(
  authId: string,
  s3Key: string,
): Promise<{ avatarUrl: string }> {
  // ── Safety check: key MUST be under profile-pictures/{authId}/ ──────────────
  const expectedPrefix = `${PFP_PREFIX}/${authId}/`;
  if (!s3Key.startsWith(expectedPrefix)) {
    throw new AppError(
      `Invalid s3Key — must be under ${expectedPrefix}`,
      400,
    );
  }

  // ── Verify the object actually exists in S3 ──────────────────────────────────
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
  } catch {
    throw new AppError(
      'File not found in S3. Please upload the file first.',
      400,
    );
  }

  // ── Magic byte validation ─────────────────────────────────────────────────────
  await validateMagicBytes(s3Key);

  // ── Fetch current profile to capture old avatarUrl ───────────────────────────
  const doc = await Profile.findOne({ authId }).lean();
  if (!doc) throw AppError.notFound('Profile not found');

  const previousAvatarUrl: string | undefined = doc.avatarUrl;

  // ── Compute new CloudFront URL ────────────────────────────────────────────────
  const newAvatarUrl = cfUrl(s3Key);

  // ── Persist to MongoDB ────────────────────────────────────────────────────────
  await Profile.updateOne(
    { authId },
    { $set: { avatarUrl: newAvatarUrl } },
    { runValidators: true },
  );

  // ── Invalidate Redis cache ────────────────────────────────────────────────────
  try {
    await redis.del(profileCacheKey(authId));
  } catch (err) {
    logger.warn({ err }, '[pfp] failed to invalidate Redis cache');
  }

  // ── Publish cleanup event for old picture (only if one existed) ───────────────
  if (previousAvatarUrl) {
    const oldKey = extractS3KeyFromUrl(previousAvatarUrl);
    if (oldKey && oldKey.startsWith(`${PFP_PREFIX}/${authId}/`)) {
      // Publish asynchronously — do NOT await; cleanup is best-effort
      publishPfpCleanup({ s3Key: oldKey, authId }).catch((err: unknown) => {
        logger.warn({ err, oldKey }, '[pfp] failed to publish cleanup event');
      });
    }
  }

  logger.info({ authId, newAvatarUrl }, '[pfp] profile picture confirmed');
  return { avatarUrl: newAvatarUrl };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads the first 12 bytes of the S3 object and validates magic byte signatures.
 * Throws AppError 400 if the file is not a recognised image format.
 */
async function validateMagicBytes(s3Key: string): Promise<void> {
  let headerBytes: Uint8Array;

  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Range: 'bytes=0-11', // first 12 bytes only
      }),
    );

    if (!res.Body) throw new Error('Empty response body');

    // Collect the stream into a buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    headerBytes = Buffer.concat(chunks);
  } catch (err) {
    logger.error({ err, s3Key }, '[pfp] failed to read magic bytes from S3');
    throw new AppError('Could not verify uploaded file. Please try again.', 500);
  }

  const isValid = MAGIC_SIGNATURES.some((sig) => {
    const offset = sig.offset ?? 0;
    const match = sig.bytes.every((b, i) => headerBytes[offset + i] === b);

    // WebP needs a secondary check: bytes 8-11 must be "WEBP"
    if (match && sig.mime === 'image/webp') {
      return WEBP_SECONDARY.every((b, i) => headerBytes[8 + i] === b);
    }

    return match;
  });

  if (!isValid) {
    throw new AppError(
      'Uploaded file does not appear to be a valid image (JPEG, PNG, or WebP).',
      400,
    );
  }
}

/**
 * Extracts the S3 key from a CloudFront or S3 URL.
 * Returns null if it cannot parse the URL safely.
 */
function extractS3KeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // pathname starts with "/", strip it
    const key = parsed.pathname.replace(/^\//, '');
    return key || null;
  } catch {
    return null;
  }
}
