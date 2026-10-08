jest.mock('@tus/server', () => ({
  Server: jest.fn().mockImplementation((options) => ({
    handle: jest.fn(),
    options,
  })),
}));
jest.mock('@tus/s3-store', () => ({
  S3Store: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
  Processor: () => () => {},
  WorkerHost: class {},
}));

import type { Queue } from 'bullmq';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelNotFoundException } from '../common/exceptions/channel-not-found.exception';
import { ChannelOwnershipException } from '../common/exceptions/channel-ownership.exception';
import { FileTooLargeException } from '../common/exceptions/file-too-large.exception';
import { UnsupportedVideoFormatException } from '../common/exceptions/unsupported-video-format.exception';
import { VideoNotFoundException } from '../common/exceptions/video-not-found.exception';
import { VideoNotReadyException } from '../common/exceptions/video-not-ready.exception';
import { StorageService } from '../storage/storage.service';
import { PROCESS_VIDEO_JOB } from './constants';
import {
  InitUploadDto,
  MAX_VIDEO_FILE_SIZE_BYTES,
} from './dto/init-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';
import { VideoVisibility } from './enums/video-visibility.enum';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  let service: VideosService;
  let videoRepository: jest.Mocked<Repository<Video>>;
  let channelRepository: jest.Mocked<Repository<Channel>>;
  let storageService: jest.Mocked<StorageService>;
  let videoQueue: jest.Mocked<Queue>;

  const mockS3Config = {
    endpoint: 'http://storage:9000',
    accessKey: 'test-access',
    secretKey: 'test-secret',
    bucketVideos: 'videos',
    bucketThumbnails: 'thumbnails',
    useSSL: false,
    region: 'us-east-1',
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const channelId = '22222222-2222-2222-2222-222222222222';

  const mockChannel: Channel = {
    id: channelId,
    user_id: userId,
    name: 'My Channel',
    nickname: 'my_channel',
    description: 'Channel description',
    created_at: new Date(),
    updated_at: new Date(),
    user: {} as any,
  };

  beforeEach(() => {
    videoRepository = {
      create: jest.fn().mockImplementation((val) => ({
        ...val,
        id: 'video-uuid-1234',
      })),
      save: jest.fn().mockImplementation(async (val) => val),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<Video>>;

    channelRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Channel>>;

    storageService = {
      getSignedDownloadUrl: jest.fn(),
      getVideoStream: jest.fn(),
      getObject: jest.fn(),
      uploadBuffer: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    videoQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' } as any),
    } as unknown as jest.Mocked<Queue>;

    service = new VideosService(
      videoRepository,
      channelRepository,
      storageService,
      mockS3Config,
      videoQueue,
    );
  });

  describe('initUpload', () => {
    const validDto: InitUploadDto = {
      channelId,
      title: 'My Epic Video',
      fileName: 'epic-video.mp4',
      fileSize: 1024 * 1024 * 500, // 500MB
      mimeType: 'video/mp4',
    };

    it('should create a draft video in DRAFT status with 12-char nanoid (happy path)', async () => {
      channelRepository.findOne.mockResolvedValue(mockChannel);
      videoRepository.findOne.mockResolvedValue(null);

      const response = await service.initUpload(validDto, userId);

      expect(response).toBeDefined();
      expect(response.id).toBe('video-uuid-1234');
      expect(response.title).toBe('My Epic Video');
      expect(response.status).toBe(VideoStatus.DRAFT);
      expect(response.publicId).toHaveLength(12);
      expect(response.uploadUrl).toBe('/videos/upload/video-uuid-1234');
      expect(response.storageKey).toContain('epic-video.mp4');

      expect(videoRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: channelId,
          title: 'My Epic Video',
          status: VideoStatus.DRAFT,
          file_size: String(validDto.fileSize),
          original_filename: 'epic-video.mp4',
        }),
      );
      expect(videoRepository.save).toHaveBeenCalled();
    });

    it('should reject disallowed MIME format with UnsupportedVideoFormatException', async () => {
      const invalidDto: InitUploadDto = {
        ...validDto,
        mimeType: 'application/pdf',
      };

      await expect(service.initUpload(invalidDto, userId)).rejects.toThrow(
        UnsupportedVideoFormatException,
      );
      expect(videoRepository.save).not.toHaveBeenCalled();
    });

    it('should reject files exceeding 10GB cap with FileTooLargeException', async () => {
      const tooLargeDto: InitUploadDto = {
        ...validDto,
        fileSize: MAX_VIDEO_FILE_SIZE_BYTES + 1,
      };

      await expect(service.initUpload(tooLargeDto, userId)).rejects.toThrow(
        FileTooLargeException,
      );
      expect(videoRepository.save).not.toHaveBeenCalled();
    });

    it('should accept files of exactly 10GB', async () => {
      channelRepository.findOne.mockResolvedValue(mockChannel);
      videoRepository.findOne.mockResolvedValue(null);

      const maxAllowedDto: InitUploadDto = {
        ...validDto,
        fileSize: MAX_VIDEO_FILE_SIZE_BYTES,
      };

      const response = await service.initUpload(maxAllowedDto, userId);
      expect(response).toBeDefined();
      expect(videoRepository.save).toHaveBeenCalled();
    });

    it('should throw ChannelNotFoundException when target channel does not exist', async () => {
      channelRepository.findOne.mockResolvedValue(null);

      await expect(service.initUpload(validDto, userId)).rejects.toThrow(
        ChannelNotFoundException,
      );
      expect(videoRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ChannelOwnershipException when caller is not the channel owner (anti-IDOR)', async () => {
      channelRepository.findOne.mockResolvedValue({
        ...mockChannel,
        user_id: 'different-user-uuid',
      });

      await expect(service.initUpload(validDto, userId)).rejects.toThrow(
        ChannelOwnershipException,
      );
      expect(videoRepository.save).not.toHaveBeenCalled();
    });

    it('should return existing draft if idempotencyKey is already registered', async () => {
      channelRepository.findOne.mockResolvedValue(mockChannel);

      const existingVideo = {
        id: 'existing-uuid',
        public_id: 'existingPub1',
        channel_id: channelId,
        channel: mockChannel,
        title: 'Existing Title',
        description: null,
        status: VideoStatus.UPLOADING,
        visibility: VideoVisibility.PUBLIC,
        original_filename: 'video.mp4',
        video_key: 'videos/existingPub1/video.mp4',
        thumbnail_key: null,
        duration_in_seconds: null,
        metadata: null,
        file_size: '1000',
        idempotency_key: 'idem-key-123',
        created_at: new Date(),
        updated_at: new Date(),
      } as Video;

      videoRepository.findOne.mockResolvedValue(existingVideo);

      const dtoWithIdem: InitUploadDto = {
        ...validDto,
        idempotencyKey: 'idem-key-123',
      };

      const result = await service.initUpload(dtoWithIdem, userId);

      expect(result.id).toBe('existing-uuid');
      expect(result.publicId).toBe('existingPub1');
      expect(videoRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('markUploadCompleted', () => {
    it('should transition video status to PROCESSING and enqueue BullMQ job', async () => {
      const mockVideo: Video = {
        id: 'vid-1',
        public_id: 'pub123',
        status: VideoStatus.UPLOADING,
        video_key: 'videos/pub123/source.mp4',
        channel_id: channelId,
        file_size: '0',
      } as any;

      videoRepository.findOne.mockResolvedValue(mockVideo);

      await service.markUploadCompleted(
        'vid-1',
        'videos/pub123/source.mp4',
        5000000,
      );

      expect(mockVideo.status).toBe(VideoStatus.PROCESSING);
      expect(mockVideo.video_key).toBe('videos/pub123/source.mp4');
      expect(mockVideo.file_size).toBe('5000000');
      expect(videoRepository.save).toHaveBeenCalledWith(mockVideo);

      expect(videoQueue.add).toHaveBeenCalledWith(
        PROCESS_VIDEO_JOB,
        { videoId: 'vid-1', videoKey: 'videos/pub123/source.mp4', channelId },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  describe('streamVideo', () => {
    const readyVideo = {
      id: 'vid-100',
      public_id: 'streamPub112',
      status: VideoStatus.READY,
      video_key: 'videos/streamPub112/sample.mp4',
      file_size: '10000',
    } as Video;

    it('should delegate to storageService.getVideoStream when video is READY', async () => {
      videoRepository.findOne.mockResolvedValue(readyVideo);
      const mockStream = new Readable({ read() {} });
      storageService.getVideoStream.mockResolvedValue({
        statusCode: 200,
        headers: { 'Content-Length': 10000 },
        stream: mockStream,
      });

      const result = await service.streamVideo('streamPub112');

      expect(result.statusCode).toBe(200);
      expect(storageService.getVideoStream).toHaveBeenCalledWith(
        readyVideo.video_key,
        undefined,
      );
    });

    it('should throw VideoNotReadyException if video status is not READY', async () => {
      videoRepository.findOne.mockResolvedValue({
        ...readyVideo,
        status: VideoStatus.PROCESSING,
      } as any);

      await expect(service.streamVideo('streamPub112')).rejects.toThrow(
        VideoNotReadyException,
      );
    });

    it('should throw VideoNotFoundException if video does not exist', async () => {
      videoRepository.findOne.mockResolvedValue(null);

      await expect(service.streamVideo('nonexistent')).rejects.toThrow(
        VideoNotFoundException,
      );
    });
  });

  describe('tus hooks (onUploadCreate & onUploadFinish)', () => {
    it('onUploadCreate should throw 400 when videoId is missing in metadata', async () => {
      const tusOptions = (service.getTusServer() as any).options;
      await expect(
        tusOptions.onUploadCreate({}, { id: 'up-1', metadata: {} }),
      ).rejects.toMatchObject({
        status_code: 400,
        body: 'Missing videoId in Upload-Metadata\n',
      });
    });

    it('onUploadCreate should throw 404 when video is not found', async () => {
      const tusOptions = (service.getTusServer() as any).options;
      videoRepository.findOne.mockResolvedValue(null);
      await expect(
        tusOptions.onUploadCreate(
          {},
          { id: 'up-1', metadata: { videoId: 'missing-vid' } },
        ),
      ).rejects.toMatchObject({
        status_code: 404,
        body: 'Video draft not found\n',
      });
    });

    it('onUploadCreate should throw 409 when video is not in DRAFT or UPLOADING', async () => {
      const tusOptions = (service.getTusServer() as any).options;
      videoRepository.findOne.mockResolvedValue({
        id: 'vid-ready',
        status: VideoStatus.READY,
      } as Video);
      await expect(
        tusOptions.onUploadCreate(
          {},
          { id: 'up-1', metadata: { videoId: 'vid-ready' } },
        ),
      ).rejects.toMatchObject({
        status_code: 409,
        body: 'Video is not in DRAFT or UPLOADING status\n',
      });
    });

    it('onUploadCreate should transition video from DRAFT to UPLOADING', async () => {
      const tusOptions = (service.getTusServer() as any).options;
      videoRepository.findOne.mockResolvedValue({
        id: 'vid-draft',
        status: VideoStatus.DRAFT,
      } as Video);
      videoRepository.update.mockResolvedValue({} as any);

      const res = await tusOptions.onUploadCreate(
        {},
        { id: 'up-1', metadata: { videoId: 'vid-draft' } },
      );
      expect(res).toEqual({});
      expect(videoRepository.update).toHaveBeenCalledWith('vid-draft', {
        status: VideoStatus.UPLOADING,
      });
    });

    it('onUploadFinish should mark upload completed when video is in UPLOADING status', async () => {
      const tusOptions = (service.getTusServer() as any).options;
      const targetVideo = {
        id: 'vid-finish',
        public_id: 'pubFin123456',
        video_key: 'videos/pubFin123456/sample.mp4',
        channel_id: 'chan-1',
        status: VideoStatus.UPLOADING,
      } as Video;
      videoRepository.findOne.mockResolvedValue(targetVideo);
      videoRepository.save.mockResolvedValue({
        ...targetVideo,
        status: VideoStatus.PROCESSING,
      });

      const res = await tusOptions.onUploadFinish(
        {},
        {
          id: 'videos/pubFin123456/sample.mp4',
          size: 1024,
          metadata: { videoId: 'vid-finish' },
        },
      );
      expect(res).toEqual({});
      expect(videoRepository.save).toHaveBeenCalled();
    });
  });

  describe('updateMetadata', () => {
    const videoWithChannel = {
      id: 'vid-200',
      public_id: 'editPub12345',
      title: 'Old Title',
      description: 'Old Desc',
      visibility: VideoVisibility.PUBLIC,
      channel: mockChannel,
    } as Video;

    it('should update title, description and visibility for channel owner', async () => {
      videoRepository.findOne.mockResolvedValue(videoWithChannel);

      const updateDto: UpdateVideoDto = {
        title: 'New Title',
        description: 'New Desc',
        visibility: VideoVisibility.UNLISTED,
      };

      const result = await service.updateMetadata(
        'editPub12345',
        updateDto,
        userId,
      );

      expect(result.title).toBe('New Title');
      expect(result.description).toBe('New Desc');
      expect(result.visibility).toBe(VideoVisibility.UNLISTED);
      expect(videoRepository.save).toHaveBeenCalled();
    });

    it('should throw ChannelOwnershipException if non-owner attempts update', async () => {
      videoRepository.findOne.mockResolvedValue(videoWithChannel);

      const updateDto: UpdateVideoDto = { title: 'Hacked Title' };

      await expect(
        service.updateMetadata('editPub12345', updateDto, 'intruder-user-id'),
      ).rejects.toThrow(ChannelOwnershipException);
    });
  });

  describe('getThumbnailStream', () => {
    it('returns stream when video has thumbnail_key', async () => {
      const mockVideo = {
        id: 'vid-thumb',
        public_id: 'thumbPub1234',
        thumbnail_key: 'thumbnails/thumbPub1234/thumb.jpg',
        visibility: VideoVisibility.PUBLIC,
      } as Video;

      videoRepository.findOne.mockResolvedValue(mockVideo);
      const fakeStream = Readable.from(['fake-image-bytes']);
      storageService.getObject.mockResolvedValue({ Body: fakeStream } as any);

      const stream = await service.getThumbnailStream('thumbPub1234');
      expect(stream).toBe(fakeStream);
      expect(storageService.getObject).toHaveBeenCalledWith(
        'thumbnails/thumbPub1234/thumb.jpg',
        storageService.thumbnailsBucket,
      );
    });

    it('throws VideoNotFoundException when video has no thumbnail_key', async () => {
      const mockVideo = {
        id: 'vid-no-thumb',
        public_id: 'noThumbPub12',
        thumbnail_key: null,
        visibility: VideoVisibility.PUBLIC,
      } as Video;

      videoRepository.findOne.mockResolvedValue(mockVideo);

      await expect(service.getThumbnailStream('noThumbPub12')).rejects.toThrow(
        VideoNotFoundException,
      );
    });
  });
});
