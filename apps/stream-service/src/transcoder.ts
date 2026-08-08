/**
 * FFmpeg transcoder — converts a raw audio file into three HLS bitrate variants
 * plus a master playlist.
 *
 * Output layout in the workDir:
 *   128k/  segment000.ts  segment001.ts ... 128k.m3u8
 *   256k/  ...                              256k.m3u8
 *   320k/  ...                              320k.m3u8
 *   master.m3u8
 *
 * All files are later uploaded to S3 under /hls/{trackId}/.
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@streamify/shared-middleware';

// Point fluent-ffmpeg to the static binary we just installed
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface TranscodeVariant {
  /** bitrate label, e.g. "128k" */
  label: string;
  /** audio bitrate passed to ffmpeg, e.g. "128k" */
  bitrate: string;
  /** HLS segment duration in seconds */
  segmentDuration: number;
}

export interface TranscodeResult {
  /** Absolute path to the directory containing all variant subdirs + master.m3u8 */
  workDir: string;
  /** Relative S3 keys of all generated files (segments + manifests) */
  files: Array<{ localPath: string; s3Key: string }>;
  /** S3 key of the master playlist */
  masterKey: string;
}

const VARIANTS: TranscodeVariant[] = [
  { label: '128k', bitrate: '128k', segmentDuration: 6 },
  { label: '256k', bitrate: '256k', segmentDuration: 6 },
  { label: '320k', bitrate: '320k', segmentDuration: 6 },
];

/**
 * Transcode a single audio file into multi-bitrate HLS.
 *
 * @param inputPath  Absolute path to the downloaded source audio file.
 * @param trackId    Used to construct the S3 key prefix (`hls/{trackId}/…`).
 * @param outDir     Directory where FFmpeg will write its output.
 */
export async function transcodeToHls(
  inputPath: string,
  trackId: string,
  outDir: string,
): Promise<TranscodeResult> {
  const files: TranscodeResult['files'] = [];

  // Run each variant sequentially to avoid overloading the CPU
  for (const variant of VARIANTS) {
    const variantDir = path.join(outDir, variant.label);
    fs.mkdirSync(variantDir, { recursive: true });

    const segmentPattern = path.join(variantDir, 'segment%03d.ts');
    const playlistPath = path.join(variantDir, `${variant.label}.m3u8`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('aac')
        .audioBitrate(variant.bitrate)
        .audioChannels(2)
        .audioFrequency(44100)
        .outputOptions([
          '-f hls',
          `-hls_time ${variant.segmentDuration}`,
          '-hls_list_size 0',
          '-hls_flags independent_segments',
          `-hls_segment_filename ${segmentPattern}`,
        ])
        .output(playlistPath)
        .on('start', (cmd) => {
          logger.debug({ cmd, variant: variant.label }, '[transcoder] ffmpeg started');
        })
        .on('progress', (progress) => {
          logger.debug(
            { timemark: progress.timemark, variant: variant.label },
            '[transcoder] progress',
          );
        })
        .on('end', () => {
          logger.info({ variant: variant.label }, '[transcoder] variant complete');
          resolve();
        })
        .on('error', (err) => {
          logger.error({ err, variant: variant.label }, '[transcoder] ffmpeg error');
          reject(err);
        })
        .run();
    });

    // Collect the variant playlist
    files.push({
      localPath: playlistPath,
      s3Key: `hls/${trackId}/${variant.label}/${variant.label}.m3u8`,
    });

    // Collect all .ts segments
    const segments = fs.readdirSync(variantDir).filter((f) => f.endsWith('.ts'));
    for (const seg of segments) {
      files.push({
        localPath: path.join(variantDir, seg),
        s3Key: `hls/${trackId}/${variant.label}/${seg}`,
      });
    }
  }

  // ── Write the master playlist ──────────────────────────────────────────────
  const masterPlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"',
    `128k/128k.m3u8`,
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=256000,CODECS="mp4a.40.2"',
    `256k/256k.m3u8`,
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=320000,CODECS="mp4a.40.2"',
    `320k/320k.m3u8`,
  ].join('\n');

  const masterPath = path.join(outDir, 'master.m3u8');
  fs.writeFileSync(masterPath, masterPlaylist, 'utf8');

  const masterKey = `hls/${trackId}/master.m3u8`;
  files.push({ localPath: masterPath, s3Key: masterKey });

  logger.info(
    { trackId, fileCount: files.length },
    '[transcoder] all variants + master playlist ready',
  );

  return { workDir: outDir, files, masterKey };
}
