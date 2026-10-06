jest.mock('@tus/server', () => ({
  Server: jest.fn().mockImplementation(() => ({
    handle: jest.fn(),
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

import { BadRequestException } from '@nestjs/common';
import { PassThrough, Readable } from 'stream';
import { ChannelOwnershipException } from '../common/exceptions/channel-ownership.exception';
import { InitUploadDto } from './dto/init-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { VideoStatus } from './enums/video-status.enum';
import { VideoVisibility } from './enums/video-visibility.enum';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

describe('VideosController', () => {
  let controller: VideosController;
  let service: jest.Mocked<VideosService>;

  beforeEach(() => {
    service = {
      initUpload: jest.fn(),
      findByPublicId: jest.fn(),
      findAll: jest.fn(),
      streamVideo: jest.fn(),
      downloadVideo: jest.fn(),
      updateMetadata: jest.fn(),
      markUploadCompleted: jest.fn(),
      getTusServer: jest.fn(),
      getThumbnailStream: jest.fn(),
    } as unknown as jest.Mocked<VideosService>;

    controller = new VideosController(service);
  });

  describe('initUpload', () => {
    it('should call VideosService.initUpload with dto and user id', async () => {
      const dto: InitUploadDto = {
        channelId: 'c-1',
        title: 'Test Video',
        fileName: 'test.mp4',
        fileSize: 1000,
        mimeType: 'video/mp4',
      };

      const mockResponse = {
        id: 'v-1',
        publicId: 'pub123456789',
        title: 'Test Video',
        status: VideoStatus.UPLOADING,
        uploadUrl: '/videos/upload/v-1',
        storageKey: 'videos/pub123456789/test.mp4',
      };

      service.initUpload.mockResolvedValue(mockResponse);

      const result = await controller.initUpload(dto, {
        sub: 'user-456',
        email: 'test@test.com',
      });

      expect(service.initUpload).toHaveBeenCalledWith(dto, 'user-456');
      expect(result).toBe(mockResponse);
    });
  });

  describe('getByPublicId', () => {
    it('should return video DTO from VideosService', async () => {
      const mockVideo: any = {
        id: 'v-1',
        public_id: 'pub123',
        title: 'Test Title',
        description: 'Test Desc',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        file_size: '5000',
        original_filename: 'test.mp4',
        thumbnail_key: 'thumb.jpg',
        duration_in_seconds: 60,
        created_at: new Date(),
        updated_at: new Date(),
        channel: { id: 'c-1', name: 'Channel', nickname: 'chan' },
      };
      service.findByPublicId.mockResolvedValue(mockVideo);

      const result = await controller.getByPublicId('pub123');
      expect(service.findByPublicId).toHaveBeenCalledWith('pub123', undefined);
      expect(result.publicId).toBe('pub123');
      expect(result.channel.nickname).toBe('chan');
    });
  });

  describe('streamVideo', () => {
    it('should set status, set headers, and pipe stream to response', async () => {
      const res: any = {
        status: jest.fn(),
        set: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      const mockStream = new Readable({ read() {} });
      const pipeSpy = jest.spyOn(mockStream, 'pipe').mockReturnValue(res);

      service.streamVideo.mockResolvedValue({
        statusCode: 206,
        headers: {
          'Content-Range': 'bytes 0-1000/5000',
          'Content-Length': 1001,
          'Accept-Ranges': 'bytes',
        },
        stream: mockStream,
      });

      await controller.streamVideo('pub123', 'bytes=0-1000', res);

      expect(service.streamVideo).toHaveBeenCalledWith(
        'pub123',
        'bytes=0-1000',
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith({
        'Content-Range': 'bytes 0-1000/5000',
        'Content-Length': 1001,
        'Accept-Ranges': 'bytes',
      });
      expect(pipeSpy).toHaveBeenCalledWith(res);
    });
  });

  describe('downloadVideo', () => {
    it('should stream the video with Content-Disposition attachment', async () => {
      const mockStream = new PassThrough();
      const pipeSpy = jest.spyOn(mockStream, 'pipe').mockImplementation();
      service.findByPublicId.mockResolvedValue({
        id: 'v-1',
        public_id: 'pub123',
        original_filename: 'my-video.mp4',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      } as any);
      service.streamVideo.mockResolvedValue({
        statusCode: 200,
        headers: { 'Content-Length': 5000 },
        stream: mockStream as any,
      });
      const res: any = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };

      await controller.downloadVideo('pub123', res);

      expect(service.findByPublicId).toHaveBeenCalledWith('pub123', undefined);
      expect(service.streamVideo).toHaveBeenCalledWith(
        'pub123',
        undefined,
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith({
        'Content-Length': 5000,
        'Content-Disposition': 'attachment; filename="my-video.mp4"',
        'Content-Type': 'video/mp4',
      });
      expect(pipeSpy).toHaveBeenCalledWith(res);
    });
  });

  describe('updateMetadata', () => {
    it('should call VideosService.updateMetadata with publicId and dto', async () => {
      const dto: UpdateVideoDto = {
        title: 'Updated Title',
        visibility: VideoVisibility.PRIVATE,
      };

      const updatedVideo: any = {
        id: 'v-1',
        public_id: 'pub123',
        title: dto.title,
        description: null,
        status: VideoStatus.READY,
        visibility: dto.visibility,
        file_size: '1000',
        original_filename: 'test.mp4',
        thumbnail_key: null,
        duration_in_seconds: 60,
        created_at: new Date(),
        updated_at: new Date(),
        channel: { id: 'c-1', name: 'Channel', nickname: 'chan' },
      };
      service.updateMetadata.mockResolvedValue(updatedVideo);

      const result = await controller.updateMetadata('pub123', dto, {
        sub: 'user-123',
        email: 'test@test.com',
      });

      expect(service.updateMetadata).toHaveBeenCalledWith(
        'pub123',
        dto,
        'user-123',
      );
      expect(result.publicId).toBe('pub123');
    });
  });

  describe('completeUpload', () => {
    it('should complete upload and return video response DTO', async () => {
      const mockVideo: any = {
        id: 'v-1',
        public_id: 'pub123',
        status: VideoStatus.PROCESSING,
        video_key: 'videos/pub123/video.mp4',
        file_size: '5000',
        channel: { id: 'c-1', user_id: 'user-1' },
      };
      service.findByPublicId.mockResolvedValue(mockVideo);
      service.markUploadCompleted.mockResolvedValue(mockVideo);

      const result = await controller.completeUpload(
        'pub123',
        { storageKey: 'videos/pub123/video.mp4', fileSize: 5000 },
        { sub: 'user-1', email: 'test@example.com' },
      );

      expect(service.findByPublicId).toHaveBeenCalledWith('pub123', 'user-1');
      expect(service.markUploadCompleted).toHaveBeenCalledWith(
        'v-1',
        'videos/pub123/video.mp4',
        5000,
      );
      expect(result.publicId).toBe('pub123');
    });

    it('should reject if channel is not owned by authenticated user', async () => {
      const mockVideo: any = {
        id: 'v-1',
        public_id: 'pub123',
        channel: { id: 'c-1', user_id: 'other-user' },
      };
      service.findByPublicId.mockResolvedValue(mockVideo);

      await expect(
        controller.completeUpload(
          'pub123',
          {},
          { sub: 'user-1', email: 'test@example.com' },
        ),
      ).rejects.toThrow(ChannelOwnershipException);
    });

    it('should reject if storageKey does not belong to the video', async () => {
      const mockVideo: any = {
        id: 'v-1',
        public_id: 'pub123',
        channel: { id: 'c-1', user_id: 'user-1' },
      };
      service.findByPublicId.mockResolvedValue(mockVideo);

      await expect(
        controller.completeUpload(
          'pub123',
          { storageKey: 'videos/another-id/secret.mp4' },
          { sub: 'user-1', email: 'test@example.com' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with channelId and return DTO list', async () => {
      const mockVideo: any = {
        id: 'v-1',
        public_id: 'pub123',
        title: 'Listed Video',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      };
      service.findAll.mockResolvedValue([mockVideo]);

      const result = await controller.findAll('c-1', {
        sub: 'user-1',
        email: 'u@example.com',
      });
      expect(service.findAll).toHaveBeenCalledWith('c-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].publicId).toBe('pub123');
    });
  });

  describe('handleTusUpload', () => {
    it('should delegate to tus server handle if initialized', async () => {
      const mockTus = { handle: jest.fn() };
      service.getTusServer.mockReturnValue(mockTus as any);

      const req: any = {};
      const res: any = {};

      await controller.handleTusUpload(req, res);

      expect(mockTus.handle).toHaveBeenCalledWith(req, res);
    });

    it('should return 503 if tus server is not initialized', async () => {
      service.getTusServer.mockReturnValue(undefined);

      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.handleTusUpload({} as any, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'SERVICE_UNAVAILABLE' }),
      );
    });
  });

  describe('getThumbnail', () => {
    it('pipes thumbnail stream with 200 and image headers', async () => {
      const fakeStream = {
        pipe: jest.fn(),
      };
      service.getThumbnailStream.mockResolvedValue(fakeStream as any);

      const res: any = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };

      await controller.getThumbnail('thumb12345678', res, {
        sub: 'user-1',
        email: 'u@example.com',
      });

      expect(service.getThumbnailStream).toHaveBeenCalledWith(
        'thumb12345678',
        'user-1',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      expect(fakeStream.pipe).toHaveBeenCalledWith(res);
    });
  });
});
