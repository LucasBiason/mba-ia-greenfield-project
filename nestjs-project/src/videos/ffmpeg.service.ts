import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import type { VideoMetadata } from './interfaces/video-metadata.interface';

/**
 * FfmpegService -- encapsulates FFprobe metadata extraction and FFmpeg thumbnail generation.
 */
@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  /**
   * Extracts technical metadata (duration, resolution, format, video codec) using ffprobe.
   */
  async extractMetadata(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: unknown, data) => {
        if (err) {
          const error =
            err instanceof Error
              ? err
              : new Error(
                  typeof err === 'string' ? err : 'Unknown ffprobe error',
                );
          this.logger.error(`ffprobe error on ${filePath}: ${error.message}`);
          return reject(error);
        }

        const duration = Math.round(data.format?.duration ?? 0);
        const videoStream = data.streams?.find((s) => s.codec_type === 'video');

        const width = videoStream?.width ?? 0;
        const height = videoStream?.height ?? 0;
        const codec = videoStream?.codec_name ?? 'unknown';
        const format = data.format?.format_name ?? 'unknown';

        resolve({
          duration,
          width,
          height,
          codec,
          format,
        });
      });
    });
  }

  /**
   * Generates a single thumbnail frame (at 1.0 second, 1280x720) and saves it to output folder.
   */
  async generateThumbnail(
    sourcePath: string,
    outputFolder: string,
    filename: string,
    timestampSeconds = 1,
    size = '1280x720',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(sourcePath)
        .screenshots({
          timestamps: [timestampSeconds],
          filename,
          folder: outputFolder,
          size,
        })
        .on('end', () => {
          const outputPath = path.join(outputFolder, filename);
          this.logger.log(`Thumbnail generated at ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err: unknown) => {
          const error =
            err instanceof Error
              ? err
              : new Error(
                  typeof err === 'string' ? err : 'Unknown FFmpeg error',
                );
          this.logger.error(
            `FFmpeg thumbnail error on ${sourcePath}: ${error.message}`,
          );
          reject(error);
        });
    });
  }
}
