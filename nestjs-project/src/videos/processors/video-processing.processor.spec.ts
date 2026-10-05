jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  WorkerHost: class {},
}));

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { Video } from '../entities/video.entity';
import { VideoStatus } from '../enums/video-status.enum';
import { FfmpegService } from '../ffmpeg.service';
import { VideoProcessingProcessor } from './video-processing.processor';

describe('VideoProcessingProcessor', () => {
  let processor: VideoProcessingProcessor;
  let videoRepository: jest.Mocked<Repository<Video>>;
  let storageService: jest.Mocked<StorageService>;
  let ffmpegService: jest.Mocked<FfmpegService>;

  beforeEach(() => {
    videoRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => v),
    } as unknown as jest.Mocked<Repository<Video>>;

    storageService = {
      videosBucket: 'videos',
      thumbnailsBucket: 'thumbnails',
      getObject: jest.fn(),
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StorageService>;

    ffmpegService = {
      extractMetadata: jest.fn(),
      generateThumbnail: jest.fn(),
    } as unknown as jest.Mocked<FfmpegService>;

    processor = new VideoProcessingProcessor(
      videoRepository,
      storageService,
      ffmpegService,
    );
  });

  it('should process a video successfully and mark it READY (happy path)', async () => {
    const video = {
      id: 'v-1',
      public_id: 'pub-12345678',
      status: VideoStatus.UPLOADING,
      video_key: 'videos/pub-12345678/video.mp4',
      duration_in_seconds: null,
      thumbnail_key: null,
      metadata: null,
    } as Video;

    videoRepository.findOne.mockResolvedValue(video);

    const stream = new Readable({
      read() {
        this.push(Buffer.from('dummy video content'));
        this.push(null);
      },
    });

    storageService.getObject.mockResolvedValue({ Body: stream } as any);

    ffmpegService.extractMetadata.mockResolvedValue({
      duration: 60,
      width: 1280,
      height: 720,
      codec: 'h264',
      format: 'mp4',
    });

    ffmpegService.generateThumbnail.mockImplementation(
      async (_src, dir, filename) => {
        const target = path.join(dir, filename);
        fs.writeFileSync(target, 'dummy image bytes');
        return target;
      },
    );

    const mockJob: any = {
      id: 'job-1',
      data: {
        videoId: 'v-1',
        videoKey: 'videos/pub-12345678/video.mp4',
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    await processor.process(mockJob);

    expect(video.status).toBe(VideoStatus.READY);
    expect(video.duration_in_seconds).toBe(60);
    expect(video.thumbnail_key).toBe('thumbnails/pub-12345678/thumbnail.jpg');
    expect(video.metadata).toEqual({
      duration: 60,
      width: 1280,
      height: 720,
      codec: 'h264',
      format: 'mp4',
    });
    expect(storageService.uploadBuffer).toHaveBeenCalledWith(
      'thumbnails/pub-12345678/thumbnail.jpg',
      expect.any(Buffer),
      'image/jpeg',
      'thumbnails',
    );
    expect(videoRepository.save).toHaveBeenCalledWith(video);
  });

  it('should return early if video does not exist', async () => {
    videoRepository.findOne.mockResolvedValue(null);

    const mockJob: any = {
      id: 'job-missing',
      data: { videoId: 'nonexistent', videoKey: 'some/key' },
    };

    await processor.process(mockJob);

    expect(storageService.getObject).not.toHaveBeenCalled();
    expect(videoRepository.save).not.toHaveBeenCalled();
  });

  it('should mark video as ERROR when processing fails on final attempt', async () => {
    const video = {
      id: 'v-err',
      public_id: 'pub-err12345',
      status: VideoStatus.UPLOADING,
      video_key: 'videos/pub-err12345/corrupt.mp4',
    } as Video;

    videoRepository.findOne.mockResolvedValue(video);
    storageService.getObject.mockRejectedValue(
      new Error('MinIO network failure'),
    );

    const mockJob: any = {
      id: 'job-fail',
      data: { videoId: 'v-err', videoKey: 'videos/pub-err12345/corrupt.mp4' },
      opts: { attempts: 3 },
      attemptsMade: 2, // 3rd and final attempt
    };

    await expect(processor.process(mockJob)).rejects.toThrow(
      'MinIO network failure',
    );

    expect(video.status).toBe(VideoStatus.ERROR);
    expect(videoRepository.save).toHaveBeenCalledWith(video);
  });
});
