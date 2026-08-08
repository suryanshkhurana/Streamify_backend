/**
 * CloudFront signed URL generator.
 *
 * Generates a CloudFront signed URL valid for `expiresInSeconds` seconds.
 * Falls back to a plain S3 URL when CloudFront is not configured (local dev).
 *
 * CloudFront setup required:
 *  1. Create a CloudFront Key Group and upload your RSA public key.
 *  2. Base64-encode the PEM private key and set CLOUDFRONT_PRIVATE_KEY.
 *  3. Set CLOUDFRONT_KEY_PAIR_ID to match the key pair you created.
 *  4. Set CLOUDFRONT_DOMAIN to your distribution domain (e.g. https://d1234.cloudfront.net).
 */

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { env } from '../config/env.js';
import { logger } from '@streamify/shared-middleware';

const DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Generate a signed CDN URL for an HLS master playlist.
 *
 * @param hlsKey   S3 key for the master.m3u8, e.g. "hls/{trackId}/master.m3u8"
 * @param expiresInSeconds  Validity window (default 1 hour)
 */
export function getSignedStreamUrl(
  hlsKey: string,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
): string {
  // ── Dev fallback: return a plain S3 URL when CloudFront is not configured ──
  if (!env.cloudfrontDomain || !env.cloudfrontKeyPairId || !env.cloudfrontPrivateKey) {
    logger.warn('[cloudfront] CloudFront not configured — returning S3 direct URL (dev only)');
    return `https://${env.s3Bucket}.s3.${env.awsRegion}.amazonaws.com/${hlsKey}`;
  }

  const privateKey = Buffer.from(env.cloudfrontPrivateKey, 'base64').toString('utf8');
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  // We MUST use a Custom Policy with a wildcard (*) at the end of the URL.
  // This allows the generated signature to be used for the master.m3u8 AND all the .ts video segments!
  const resourceUrl = `${env.cloudfrontDomain.replace(/\/$/, '')}/${hlsKey.split('/master.m3u8')[0]}/*`;
  
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: resourceUrl,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': expiresAt,
          },
        },
      },
    ],
  });

  const signedUrl = getSignedUrl({
    url: `${env.cloudfrontDomain.replace(/\/$/, '')}/${hlsKey}`, // We still want the URL to point to master.m3u8
    keyPairId: env.cloudfrontKeyPairId,
    privateKey,
    policy,
  });

  logger.debug({ hlsKey, expiresInSeconds }, '[cloudfront] signed URL generated');
  return signedUrl;
}
