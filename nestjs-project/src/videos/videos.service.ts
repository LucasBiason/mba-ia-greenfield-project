import type { Readable } from 'stream';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { S3Store } from '@tus/s3-store';
import { Server as TusServer } from '@tus/server';
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

      this.tusServer = new TusServer({
        path: '/videos/upload',
        datastore: s3Store,
        maxSize: MAX_VIDEO_FILE_SIZE_BYTES,
        allowedOrigins: (origin: string) => Boolean(origin),
        allowedCredentials: true,
        onUploadCreate: async (_req: unknown, upload: unknown) => {
          const tusUpload = upload as {
            id: string;
            size?: number;
            metadata?: Record<string, string | null | undefined>;
          };
          class TusError extends Error {
            constructor(
              public readonly status_code: number,
              public readonly body: string,
            ) {
              super(body);
              this.name = 'TusError';
            }
          }

          const videoId = tusUpload.metadata?.videoId;
          if (!videoId) {
            this.logger.warn(
              `Tus upload rejected: missing videoId in metadata`,
            );
            throw new TusError(400, 'Missing videoId in Upload-Metadata\n');
          }
          const video = await this.videoRepository.findOne({
            where: { id: videoId },
          });
          if (!video) {
            this.logger.warn(`Tus upload rejected: video ${videoId} not found`);
            throw new TusError(404, 'Video draft not found\n');
          }
          if (
            video.status !== VideoStatus.DRAFT &&
            video.status !== VideoStatus.UPLOADING
          ) {
            this.logger.warn(
              `Tus upload rejected: video ${videoId} in invalid status ${video.status}`,
            );
            throw new TusError(
              409,
              'Video is not in DRAFT or UPLOADING status\n',
            );
          }
          await this.videoRepository.update(videoId, {
            status: VideoStatus.UPLOADING,
          });
          return {};
        },
        onUploadFinish: async (_req: unknown, upload: unknown) => {
          const tusUpload = upload as {
            id: string;
            size?: number;
            metadata?: Record<string, string | null | undefined>;
          };
          this.logger.log(`Tus upload completed: ${tusUpload.id}`);
          const videoId = tusUpload.metadata?.videoId;
          if (typeof videoId === 'string' && videoId.length > 0) {
            const video = await this.videoRepository.findOne({
              where: { id: videoId },
            });
            if (
              video &&
              (video.status === VideoStatus.DRAFT ||
                video.status === VideoStatus.UPLOADING)
            ) {
              await this.markUploadCompleted(
                videoId,
                tusUpload.id,
                tusUpload.size ?? 0,
              );
            }
          }
          return {};
        },
      });
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
   * Initiates an upload / draft for an authenticated channel owner.
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
    let channel: Channel | null = null;
    if (dto.channelId) {
      channel = await this.channelRepository.findOne({
        where: { id: dto.channelId },
      });
      if (!channel) {
        throw new ChannelNotFoundException();
      }
      if (channel.user_id !== userId) {
        throw new ChannelOwnershipException();
      }
    } else {
      channel = await this.channelRepository.findOne({
        where: { user_id: userId },
      });
      if (!channel) {
        throw new ChannelNotFoundException();
      }
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
      status: VideoStatus.DRAFT,
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
      await this.videoRepository.update(videoId, {
        status: VideoStatus.ERROR,
      });
      throw err;
    }
  }

  /**
   * Streams video content with RFC 7233 HTTP Range partial content (HTTP 206).
   */
  async streamVideo(
    publicId: string,
    rangeHeader?: string,
    userId?: string,
  ): Promise<StreamResult> {
    const video = await this.findByPublicId(publicId, userId);

    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException(video.status);
    }

    return this.storageService.getVideoStream(video.video_key, rangeHeader);
  }

  /**
   * Streams thumbnail JPEG image for video.
   */
  async getThumbnailStream(
    publicId: string,
    userId?: string,
  ): Promise<Readable> {
    const video = await this.findByPublicId(publicId, userId);

    if (!video.thumbnail_key) {
      throw new VideoNotFoundException();
    }

    const output = await this.storageService.getObject(
      video.thumbnail_key,
      this.storageService.thumbnailsBucket,
    );

    return output.Body as Readable;
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
   * Lists videos optionally filtered by channelId and respecting visibility rules.
   */
  async findAll(channelId?: string, userId?: string): Promise<Video[]> {
    const query = this.videoRepository
      .createQueryBuilder('video')
      .leftJoinAndSelect('video.channel', 'channel')
      .orderBy('video.created_at', 'DESC');

    if (channelId) {
      query.andWhere('video.channel_id = :channelId', { channelId });
      const channel = await this.channelRepository.findOne({
        where: { id: channelId },
      });
      const isOwner = Boolean(userId && channel && channel.user_id === userId);
      if (!isOwner) {
        query.andWhere('video.visibility = :visibility', {
          visibility: VideoVisibility.PUBLIC,
        });
      }
    } else {
      query.andWhere('video.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      });
    }

    return query.getMany();
  }

  /**
   * Finds a video by its public_id with channel relation and checks access permissions.
   */
  async findByPublicId(publicId: string, userId?: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { public_id: publicId },
      relations: ['channel'],
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.visibility === VideoVisibility.PRIVATE) {
      if (!userId || (video.channel && video.channel.user_id !== userId)) {
        throw new ChannelOwnershipException();
      }
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
