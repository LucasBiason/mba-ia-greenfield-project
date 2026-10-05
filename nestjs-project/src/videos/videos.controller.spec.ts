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

import { Readable } from 'stream';
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
      streamVideo: jest.fn(),
      downloadVideo: jest.fn(),
      updateMetadata: jest.fn(),
      getTusServer: jest.fn(),
    } as unknown as jest.Mocked<VideosService>;

    controller = new VideosController(service);
  });

  describe('initUpload', () => {
    it('should call VideosService.initUpload with dto and effective user id', async () => {
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
    it('should return video from VideosService', async () => {
      const mockVideo: any = { id: 'v-1', public_id: 'pub123' };
      service.findByPublicId.mockResolvedValue(mockVideo);

      const result = await controller.getByPublicId('pub123');
      expect(service.findByPublicId).toHaveBeenCalledWith('pub123');
      expect(result).toBe(mockVideo);
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
    it('should redirect to the signed download url', async () => {
      service.downloadVideo.mockResolvedValue('https://signed.url/download');
      const res: any = {
        redirect: jest.fn(),
      };

      await controller.downloadVideo('pub123', res);

      expect(service.downloadVideo).toHaveBeenCalledWith('pub123');
      expect(res.redirect).toHaveBeenCalledWith('https://signed.url/download');
    });
  });

  describe('updateMetadata', () => {
    it('should call VideosService.updateMetadata with publicId and dto', async () => {
      const dto: UpdateVideoDto = {
        title: 'Updated Title',
        visibility: VideoVisibility.PRIVATE,
      };

      const updatedVideo: any = { id: 'v-1', ...dto };
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
      expect(result).toBe(updatedVideo);
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
});
