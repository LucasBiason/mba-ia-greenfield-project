import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import type { Server as TusServer } from '@tus/server';
import { nanoid } from 'nanoid';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelNotFoundException } from '../common/exceptions/channel-not-found.exception';
import { ChannelOwnershipException } from '../common/exceptions/channel-ownership.exception';
import { FileTooLargeException } from '../common/exceptions/file-too-large.exception';
import { UnsupportedVideoFormatException } from '../common/exceptions/unsupported-video-format.exception';
import { VideoNotFoundException } from '../common/exceptions/video-not-found.exception';
import { VideoNotReadyException } from '../common/exceptions/video-not-ready.exception';
import storageConfig from '../config/storage.config';
import { StorageService, StreamResult } from '../storage/storage.service';
import { PROCESS_VIDEO_JOB, VIDEO_PROCESSING_QUEUE } from './constants';
import {
  InitUploadDto,
  MAX_VIDEO_FILE_SIZE_BYTES,
} from './dto/init-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadResponseDto } from './dto/upload-response.dto';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';
import { VideoVisibility } from './enums/video-visibility.enum';

/**
 * Allowed video MIME types for ingestion (mp4, webm, quicktime).
 */
export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

interface TusUploadInfo {
  id: string;
  size?: number;
  metadata?: {
    videoId?: string;
    [key: string]: string | undefined;
  };
}

/**
 * VideosService -- implements video upload, draft management, processing dispatch,
 * streaming, and metadata editing.
 */
@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);
  private tusServer?: TusServer;

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly storageService: StorageService,
    @Inject(storageConfig.KEY)
    private readonly s3Config: ConfigType<typeof storageConfig>,
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly videoQueue: Queue,
  ) {
    this.initTusServer();
  }

  /**
   * Initializes the Tus protocol server with S3Store.
   */
  private initTusServer(): void {
    try {
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
      const { S3Store } = require('@tus/s3-store');
      const { Server: TusServerClass } = require('@tus/server');

      const s3Store = new S3Store({
        s3ClientConfig: {
          bucket: this.s3Config.bucketVideos,
          endpoint: this.s3Config.endpoint,
          region: this.s3Config.region,
          credentials: {
            accessKeyId: this.s3Config.accessKey,
            secretAccessKey: this.s3Config.secretKey,
          },
          forcePathStyle: true,
          tls: this.s3Config.useSSL,
        },
        partSize: 8 * 1024 * 1024, // 8 MiB parts for S3 multipart
      });

      this.tusServer = new TusServerClass({
        path: '/videos/upload',
        datastore: s3Store,
        maxSize: MAX_VIDEO_FILE_SIZE_BYTES,
        onUploadFinish: async (_req: unknown, upload: TusUploadInfo) => {
          this.logger.log(`Tus upload completed: ${upload.id}`);
          if (upload.metadata?.videoId) {
            await this.markUploadCompleted(
              upload.metadata.videoId,
              upload.id,
              upload.size ?? 0,
            );
          }
          return {};
        },
      });
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not initialize TusServer: ${message}`);
    }
  }

  /**
   * Returns the underlying TusServer instance for controller delegation.
   */
  getTusServer(): TusServer | undefined {
    return this.tusServer;
  }

  /**
   * Initiates an upload / draft for a channel owner.
   */
  async initUpload(
    dto: InitUploadDto,
    userId: string,
  ): Promise<UploadResponseDto> {
    // 1. Validate format
    if (!ALLOWED_VIDEO_MIME_TYPES.has(dto.mimeType)) {
      throw new UnsupportedVideoFormatException(dto.mimeType);
    }

    // 2. Validate 10GB cap
    if (dto.fileSize > MAX_VIDEO_FILE_SIZE_BYTES) {
      throw new FileTooLargeException(MAX_VIDEO_FILE_SIZE_BYTES);
    }

    // 3. Verify channel existence and ownership
    const channel = await this.channelRepository.findOne({
      where: { id: dto.channelId },
    });

    if (!channel) {
      throw new ChannelNotFoundException();
    }

    if (channel.user_id !== userId) {
      throw new ChannelOwnershipException();
    }

    // 4. Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.videoRepository.findOne({
        where: { idempotency_key: dto.idempotencyKey },
      });
      if (existing) {
        return this.mapToResponse(existing);
      }
    }

    // 5. Generate collision-free public_id (nanoid 12 chars)
    const publicId = await this.generateUniquePublicId();

    // 6. Generate storage key
    const sanitizedFileName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const videoKey = `videos/${publicId}/${sanitizedFileName}`;

    // 7. Persist draft Video record
    const video = this.videoRepository.create({
      public_id: publicId,
      channel_id: channel.id,
      title: dto.title ?? null,
      status: VideoStatus.UPLOADING,
      visibility: VideoVisibility.PUBLIC,
      original_filename: dto.fileName,
      file_size: String(dto.fileSize),
      video_key: videoKey,
      idempotency_key: dto.idempotencyKey ?? null,
    });

    await this.videoRepository.save(video);

    return this.mapToResponse(video);
  }

  /**
   * Generates a unique 12-char public ID with retry on collision.
   */
  private async generateUniquePublicId(maxAttempts = 5): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const id = nanoid(12);
      const existing = await this.videoRepository.findOne({
        where: { public_id: id },
      });
      if (!existing) {
        return id;
      }
    }
    throw new Error(
      'Failed to generate unique public ID after multiple attempts',
    );
  }

  /**
   * Marks a video upload as completed, transitions to PROCESSING, and enqueues FFmpeg job.
   */
  async markUploadCompleted(
    videoId: string,
    storageKey: string,
    fileSize: number,
  ): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    video.status = VideoStatus.PROCESSING;
    if (storageKey) {
      video.video_key = storageKey;
    }
    if (fileSize > 0) {
      video.file_size = String(fileSize);
    }

    const saved = await this.videoRepository.save(video);

    // Enqueue BullMQ processing job for FFmpeg worker
    await this.enqueueVideoProcessing(
      saved.id,
      saved.video_key,
      saved.channel_id,
    );

    return saved;
  }

  /**
   * Enqueues an asynchronous FFmpeg processing job into BullMQ.
   */
  async enqueueVideoProcessing(
    videoId: string,
    videoKey: string,
    channelId: string,
  ): Promise<void> {
    try {
      await this.videoQueue.add(
        PROCESS_VIDEO_JOB,
        { videoId, videoKey, channelId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
        },
      );
      this.logger.log(`Enqueued video processing job for video ${videoId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Could not enqueue video job: ${msg}`);
    }
  }

  /**
   * Streams video content with RFC 7233 HTTP Range partial content (HTTP 206).
   */
  async streamVideo(
    publicId: string,
    rangeHeader?: string,
  ): Promise<StreamResult> {
    const video = await this.findByPublicId(publicId);

    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException(video.status);
    }

    return this.storageService.getVideoStream(video.video_key, rangeHeader);
  }

  /**
   * Alias for streamVideo for compatibility.
   */
  async getVideoStream(
    publicId: string,
    rangeHeader?: string,
  ): Promise<StreamResult> {
    return this.streamVideo(publicId, rangeHeader);
  }

  /**
   * Generates a signed download URL for the video.
   */
  async downloadVideo(publicId: string): Promise<string> {
    const video = await this.findByPublicId(publicId);
    return this.storageService.getSignedDownloadUrl(
      video.video_key,
      video.original_filename,
    );
  }

  /**
   * Updates video metadata and visibility.
   */
  async updateMetadata(
    publicId: string,
    dto: UpdateVideoDto,
    userId: string,
  ): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { public_id: publicId },
      relations: ['channel'],
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.channel && video.channel.user_id !== userId) {
      throw new ChannelOwnershipException();
    }

    if (dto.title !== undefined) {
      video.title = dto.title;
    }
    if (dto.description !== undefined) {
      video.description = dto.description;
    }
    if (dto.visibility !== undefined) {
      video.visibility = dto.visibility;
    }

    return this.videoRepository.save(video);
  }

  /**
   * Finds a video by its public_id.
   */
  async findByPublicId(publicId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { public_id: publicId },
      relations: ['channel'],
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    return video;
  }

  /**
   * Maps a Video entity to the client response DTO.
   */
  private mapToResponse(video: Video): UploadResponseDto {
    return {
      id: video.id,
      publicId: video.public_id,
      title: video.title ?? '',
      status: video.status,
      uploadUrl: `/videos/upload/${video.id}`,
      storageKey: video.video_key,
    };
  }
}
