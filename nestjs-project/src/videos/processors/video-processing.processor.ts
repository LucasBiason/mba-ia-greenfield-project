import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { VIDEO_PROCESSING_QUEUE } from '../constants';
import { Video } from '../entities/video.entity';
import { VideoStatus } from '../enums/video-status.enum';
import { FfmpegService } from '../ffmpeg.service';

/**
 * Job payload for video processing.
 */
export interface ProcessVideoJobData {
  videoId: string;
  videoKey?: string;
  storageKey?: string;
  channelId?: string;
}

/**
 * VideoProcessingProcessor -- consumes video processing jobs from BullMQ queue.
 *
 * Responsibilities:
 *  - Downloads source video stream from storage to isolated temp directory.
 *  - Extracts technical metadata (duration, width, height, codec) via FFprobe.
 *  - Generates thumbnail frame (at 1s, 1280x720) via FFmpeg and uploads to MinIO thumbnails bucket.
 *  - Updates Video entity to READY (or ERROR on exhaustion) with extracted attributes.
 */
@Processor(VIDEO_PROCESSING_QUEUE)
export class VideoProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {
    super();
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    const { videoId } = job.data;
    this.logger.log(`Processing video job ${job.id} for video: ${videoId}`);

    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      this.logger.error(`Video ${videoId} not found for job ${job.id}`);
      return;
    }

    const key = job.data.videoKey || job.data.storageKey || video.video_key;

    video.status = VideoStatus.PROCESSING;
    await this.videoRepository.save(video);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamtube-proc-'));
    const tempSourceFile = path.join(tempDir, 'source_video');
    const thumbnailFileName = 'thumbnail.jpg';

    try {
      // 1. Download source stream to temporary file
      const s3Response = await this.storageService.getObject(
        key,
        this.storageService.videosBucket,
      );

      if (!s3Response.Body) {
        throw new Error(`Empty body for storage object: ${key}`);
      }

      await pipeline(
        s3Response.Body as Readable,
        fs.createWriteStream(tempSourceFile),
      );

      // 2. Extract technical metadata via FFprobe
      const metadata = await this.ffmpegService.extractMetadata(tempSourceFile);
      this.logger.log(
        `Extracted metadata for ${videoId}: duration=${metadata.duration}s, res=${metadata.width}x${metadata.height}`,
      );

      // 3. Generate thumbnail frame via FFmpeg (frame 1s, 1280x720)
      const thumbnailPath = await this.ffmpegService.generateThumbnail(
        tempSourceFile,
        tempDir,
        thumbnailFileName,
        1,
        '1280x720',
      );

      // 4. Upload thumbnail to storage
      const thumbnailBuffer = fs.readFileSync(thumbnailPath);
      const thumbnailKey = `thumbnails/${video.public_id}/${thumbnailFileName}`;

      await this.storageService.uploadBuffer(
        thumbnailKey,
        thumbnailBuffer,
        'image/jpeg',
        this.storageService.thumbnailsBucket,
      );

      // 5. Update video record to READY
      video.status = VideoStatus.READY;
      video.duration_in_seconds = metadata.duration;
      video.thumbnail_key = thumbnailKey;
      video.metadata = {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        format: metadata.format,
      };

      await this.videoRepository.save(video);
      this.logger.log(
        `Video ${videoId} successfully processed and marked READY`,
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to process video ${videoId}: ${errorMsg}`);

      // If attempts exhausted or unrecoverable, mark ERROR
      const maxAttempts = job.opts?.attempts ?? 3;
      if ((job.attemptsMade ?? 0) + 1 >= maxAttempts) {
        video.status = VideoStatus.ERROR;
        video.metadata = {
          ...(video.metadata || {}),
          error: errorMsg,
        };
        await this.videoRepository.save(video);
      }

      throw err;
    } finally {
      // Clean up temporary files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
