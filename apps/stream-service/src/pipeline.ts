/**
 * Transcoding pipeline worker.
 *
 * This module is called by the RabbitMQ consumer when a `track.uploaded`
 * event arrives. It orchestrates the full transcoding flow:
 *
 *   1. Download raw audio from S3 → temp disk
 *   2. FFmpeg → 128k / 256k / 320k HLS variants + master.m3u8
 *   3. Upload all HLS files → S3 under hls/{trackId}/
 *   4. PATCH catalog-service to update hlsKey + set status READY
 *   5. Publish track.ready to RabbitMQ
 *   6. Clean up temp files
 *
 * On any error:
 *   - PATCH catalog-service to set status FAILED
 *   - Publish track.failed
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { transcodeToHls } from './transcoder.js';
import { downloadToFile, uploadHlsFiles } from './storage/s3.storage.js';
import { publishTrackReady, publishTrackFailed } from './events/publisher.js';
import { env } from './config/env.js';
import { logger } from '@streamify/shared-middleware';

export interface TrackUploadedPayload {
  trackId: string;
  /** S3 key of the uploaded raw audio file, e.g. "artists/{artistId}/tracks/{trackId}.mp3" */
  s3Key: string;
}

/**
 * Run the full transcoding pipeline for a single uploaded track.
 */
export async function runTranscodingPipeline(payload: TrackUploadedPayload): Promise<void> {
  const { trackId, s3Key } = payload;
  const workDir = path.join(os.tmpdir(), 'streamify', trackId);
  const rawFilePath = path.join(workDir, 'raw.mp3');

  logger.info({ trackId, s3Key }, '[pipeline] starting transcoding pipeline');

  try {
    // ── Step 1: Download raw audio ───────────────────────────────────────────
    fs.mkdirSync(workDir, { recursive: true });
    await downloadToFile(s3Key, rawFilePath);

    // ── Step 2: Transcode to HLS ────────────────────────────────────────────
    const { files, masterKey } = await transcodeToHls(rawFilePath, trackId, workDir);

    // ── Step 3: Upload all HLS files to S3 ─────────────────────────────────
    await uploadHlsFiles(files);

    // ── Step 4: Update catalog-service (set hlsKey + status READY) ──────────
    await updateCatalogTrackReady(trackId, { hlsKey: masterKey, durationMs: 0 });

    // ── Step 5: Publish track.ready ──────────────────────────────────────────
    await publishTrackReady({ trackId, hlsKey: masterKey, durationMs: 0 });

    logger.info({ trackId }, '[pipeline] transcoding pipeline complete ✓');
  } catch (err) {
    logger.error({ err, trackId }, '[pipeline] transcoding pipeline failed');

    // Best-effort: update catalog + publish failure event
    try {
      await updateCatalogTrackFailed(trackId);
    } catch (updateErr) {
      logger.error({ updateErr }, '[pipeline] failed to update catalog status to FAILED');
    }

    try {
      await publishTrackFailed({
        trackId,
        reason: err instanceof Error ? err.message : String(err),
      });
    } catch (pubErr) {
      logger.error({ pubErr }, '[pipeline] failed to publish track.failed event');
    }
  } finally {
    // ── Step 6: Clean up temp files ──────────────────────────────────────────
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      logger.debug({ workDir }, '[pipeline] temp files cleaned up');
    } catch (cleanErr) {
      logger.warn({ cleanErr, workDir }, '[pipeline] failed to clean up temp dir');
    }
  }
}

// ─── Internal: call catalog-service PATCH endpoint ───────────────────────────

async function updateCatalogTrackReady(trackId: string, body: { hlsKey?: string; durationMs?: number }): Promise<void> {
  const url = `${env.catalogServiceUrl}/internal/tracks/${trackId}/ready`;

  logger.info({ trackId, body, url }, '[pipeline] patching catalog-service (ready)');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Secret': env.jwtSecret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[pipeline] catalog PATCH /ready failed: ${res.status} ${text}`);
  }

  logger.info({ trackId }, '[pipeline] catalog track marked READY');
}

async function updateCatalogTrackFailed(trackId: string): Promise<void> {
  const url = `${env.catalogServiceUrl}/internal/tracks/${trackId}/failed`;

  logger.info({ trackId, url }, '[pipeline] patching catalog-service (failed)');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Secret': env.jwtSecret,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[pipeline] catalog PATCH /failed failed: ${res.status} ${text}`);
  }

  logger.info({ trackId }, '[pipeline] catalog track marked FAILED');
}
