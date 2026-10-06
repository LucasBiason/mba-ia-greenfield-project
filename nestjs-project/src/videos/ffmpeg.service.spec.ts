const mockFfprobe = jest.fn();
const mockScreenshots = jest.fn();

jest.mock('fluent-ffmpeg', () => {
  const fn = jest.fn(() => ({
    screenshots: mockScreenshots,
  }));
  (fn as any).ffprobe = mockFfprobe;
  return fn;
});

import ffmpeg from 'fluent-ffmpeg';
import { FfmpegService } from './ffmpeg.service';

describe('FfmpegService', () => {
  let service: FfmpegService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FfmpegService();
  });

  describe('extractMetadata', () => {
    it('should extract duration, resolution, format, and codec from ffprobe data', async () => {
      mockFfprobe.mockImplementation((filePath: string, callback: Function) => {
        callback(null, {
          format: {
            duration: 125.4,
            format_name: 'mp4',
          },
          streams: [
            {
              codec_type: 'video',
              width: 1920,
              height: 1080,
              codec_name: 'h264',
            },
          ],
        });
      });

      const metadata = await service.extractMetadata('/path/to/video.mp4');

      expect(metadata).toEqual({
        duration: 125,
        width: 1920,
        height: 1080,
        format: 'mp4',
        codec: 'h264',
      });
      expect(mockFfprobe).toHaveBeenCalledWith(
        '/path/to/video.mp4',
        expect.any(Function),
      );
    });

    it('should reject when ffprobe returns an error', async () => {
      mockFfprobe.mockImplementation((filePath: string, callback: Function) => {
        callback(new Error('Corrupt video file'), null);
      });

      await expect(
        service.extractMetadata('/path/to/corrupt.mp4'),
      ).rejects.toThrow('Corrupt video file');
    });
  });

  describe('generateThumbnail', () => {
    it('should generate a thumbnail and resolve with the output path', async () => {
      const emitter = {
        on: jest.fn().mockImplementation(function (
          this: any,
          event: string,
          handler: Function,
        ) {
          if (event === 'end') {
            setTimeout(() => handler(), 10);
          }
          return this;
        }),
      };
      mockScreenshots.mockReturnValue(emitter);

      const result = await service.generateThumbnail(
        '/path/to/video.mp4',
        '/tmp/output',
        'thumb.jpg',
        2,
        '1280x720',
      );

      expect(result).toBe('/tmp/output/thumb.jpg');
      expect(ffmpeg).toHaveBeenCalledWith('/path/to/video.mp4');
      expect(mockScreenshots).toHaveBeenCalledWith({
        timestamps: [2],
        filename: 'thumb.jpg',
        folder: '/tmp/output',
        size: '1280x720',
      });
    });

    it('should reject when ffmpeg emits error event', async () => {
      const emitter = {
        on: jest.fn().mockImplementation(function (
          this: any,
          event: string,
          handler: Function,
        ) {
          if (event === 'error') {
            setTimeout(() => handler(new Error('FFmpeg execution failed')), 10);
          }
          return this;
        }),
      };
      mockScreenshots.mockReturnValue(emitter);

      await expect(
        service.generateThumbnail(
          '/path/to/video.mp4',
          '/tmp/output',
          'thumb.jpg',
        ),
      ).rejects.toThrow('FFmpeg execution failed');
    });
  });
});
