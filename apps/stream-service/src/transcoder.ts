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
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@streamify/shared-middleware';

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

  // 1. Create subdirectories for all variants
  for (const variant of VARIANTS) {
    const variantDir = path.join(outDir, variant.label);
    fs.mkdirSync(variantDir, { recursive: true });
  }

  const masterPath = path.join(outDir, 'master.m3u8');

  // 2. Build FFmpeg options for a single pass
  const streamMapItems: string[] = [];

  VARIANTS.forEach((variant, index) => {
    // Add to var_stream_map
    streamMapItems.push(`a:${index},name:${variant.label}`);
  });

  // Output pattern for the variant playlists (e.g., 128k.m3u8, 256k.m3u8, 320k.m3u8)
  const outputPathPattern = path.join(outDir, '%v.m3u8').replace(/\\/g, '/');

  // Unified segment filename pattern (e.g. 128k_segment000.ts)
  const segmentFilenamePattern = path.join(outDir, '%v_segment%03d.ts').replace(/\\/g, '/');

  const outputOptions: string[] = [];
  VARIANTS.forEach((variant, index) => {
    outputOptions.push('-map', '0:a');
    outputOptions.push(`-c:a:${index}`, 'aac');
    outputOptions.push(`-b:a:${index}`, variant.bitrate);
    outputOptions.push(`-ac:a:${index}`, '2');
    outputOptions.push(`-ar:a:${index}`, '44100');
  });

  // HLS global options
  outputOptions.push(
    '-f', 'hls',
    '-hls_time', String(VARIANTS[0].segmentDuration),
    '-hls_list_size', '0',
    '-hls_flags', 'independent_segments',
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', streamMapItems.join(' '),
    '-hls_segment_filename', segmentFilenamePattern
  );

  // 3. Execute FFmpeg
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .outputOptions(outputOptions)
      .output(outputPathPattern)
      .on('start', (cmd: string) => {
        logger.info({ cmd }, '[transcoder] ffmpeg multi-bitrate started');
      })
      .on('progress', (progress: any) => {
        logger.debug({ timemark: progress.timemark }, '[transcoder] progress');
      })
      .on('end', () => {
        logger.info('[transcoder] transcoding complete');
        resolve();
      })
      .on('error', (err: any, stdout: any, stderr: any) => {
        logger.error({ err, stdout, stderr }, '[transcoder] ffmpeg error');
        reject(err);
      })
      .run();
  });

  // 4. Collect generated files for S3 upload
  const masterKey = `hls/${trackId}/master.m3u8`;
  files.push({ localPath: masterPath, s3Key: masterKey });

  for (const variant of VARIANTS) {
    // Collect variant playlist
    const playlistName = `${variant.label}.m3u8`;
    const playlistLocalPath = path.join(outDir, playlistName);
    if (fs.existsSync(playlistLocalPath)) {
      files.push({
        localPath: playlistLocalPath,
        s3Key: `hls/${trackId}/${playlistName}`,
      });
    }

    // Collect all .ts segments for this variant from outDir
    const allFiles = fs.readdirSync(outDir);
    const segments = allFiles.filter((f: string) => f.startsWith(`${variant.label}_segment`) && f.endsWith('.ts'));
    
    for (const seg of segments) {
      files.push({
        localPath: path.join(outDir, seg),
        s3Key: `hls/${trackId}/${seg}`,
      });
    }
  }

  logger.info(
    { trackId, fileCount: files.length },
    '[transcoder] all variants + master playlist ready',
  );

  return { workDir: outDir, files, masterKey };
}
