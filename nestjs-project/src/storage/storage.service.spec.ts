import { Readable } from 'stream';
import { StorageService } from './storage.service';
import { RangeNotSatisfiableException } from '../common/exceptions/range-not-satisfiable.exception';

describe('StorageService', () => {
  let service: StorageService;
  let mockS3Send: jest.Mock;

  const mockConfig = {
    endpoint: 'http://localhost:9000',
    port: 9000,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    bucketVideos: 'videos',
    bucketThumbnails: 'thumbnails',
    useSSL: false,
    region: 'us-east-1',
  };

  beforeEach(() => {
    mockS3Send = jest.fn();
    service = new StorageService(mockConfig);
    // Mock the internal s3Client.send
    (service.client as any).send = mockS3Send;
  });

  describe('ensureBucketsExist', () => {
    it('should check if buckets exist and create them if not', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('Bucket does not exist')); // HeadBucket fails
      mockS3Send.mockResolvedValueOnce({}); // CreateBucket succeeds
      mockS3Send.mockResolvedValueOnce({}); // HeadBucket succeeds for 2nd bucket

      await service.ensureBucketsExist();

      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('parseRange', () => {
    it('should parse standard range correctly', () => {
      const result = service.parseRange('bytes=0-499', 1000);
      expect(result).toEqual({ start: 0, end: 499 });
    });

    it('should parse open-ended range correctly', () => {
      const result = service.parseRange('bytes=500-', 1000);
      expect(result).toEqual({ start: 500, end: 999 });
    });

    it('should parse suffix range correctly', () => {
      const result = service.parseRange('bytes=-200', 1000);
      expect(result).toEqual({ start: 800, end: 999 });
    });

    it('should return null for invalid range format', () => {
      const result = service.parseRange('invalid-range', 1000);
      expect(result).toBeNull();
    });

    it('should throw RangeNotSatisfiableException if start >= totalSize', () => {
      expect(() => service.parseRange('bytes=1500-2000', 1000)).toThrow(
        RangeNotSatisfiableException,
      );
    });
  });

  describe('getVideoStream', () => {
    it('should return 200 with full stream when range header is not provided', async () => {
      const mockStream = new Readable({ read() {} });
      mockS3Send.mockResolvedValueOnce({
        ContentLength: 5000,
        ContentType: 'video/mp4',
      }); // HeadObject
      mockS3Send.mockResolvedValueOnce({ Body: mockStream }); // GetObject

      const result = await service.getVideoStream('video-key');

      expect(result.statusCode).toBe(200);
      expect(result.headers['Content-Length']).toBe(5000);
      expect(result.headers['Accept-Ranges']).toBe('bytes');
      expect(result.headers['Content-Type']).toBe('video/mp4');
      expect(result.stream).toBe(mockStream);
    });

    it('should return 206 Partial Content when range header is valid', async () => {
      const mockStream = new Readable({ read() {} });
      mockS3Send.mockResolvedValueOnce({
        ContentLength: 5000,
        ContentType: 'video/mp4',
      }); // HeadObject
      mockS3Send.mockResolvedValueOnce({ Body: mockStream }); // GetObject partial

      const result = await service.getVideoStream('video-key', 'bytes=0-999');

      expect(result.statusCode).toBe(206);
      expect(result.headers['Content-Range']).toBe('bytes 0-999/5000');
      expect(result.headers['Content-Length']).toBe(1000);
      expect(result.headers['Accept-Ranges']).toBe('bytes');
      expect(result.headers['Content-Type']).toBe('video/mp4');
      expect(result.stream).toBe(mockStream);
    });

    it('should throw RangeNotSatisfiableException if requested range is out of bounds', async () => {
      mockS3Send.mockResolvedValueOnce({
        ContentLength: 5000,
        ContentType: 'video/mp4',
      }); // HeadObject

      await expect(
        service.getVideoStream('video-key', 'bytes=6000-7000'),
      ).rejects.toThrow(RangeNotSatisfiableException);
    });
  });

  describe('uploadBuffer', () => {
    it('should send PutObjectCommand', async () => {
      mockS3Send.mockResolvedValueOnce({});
      const buffer = Buffer.from('test data');

      await service.uploadBuffer('key', buffer, 'image/jpeg');

      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('deleteObject', () => {
    it('should send DeleteObjectCommand', async () => {
      mockS3Send.mockResolvedValueOnce({});

      await service.deleteObject('key');

      expect(mockS3Send).toHaveBeenCalled();
    });
  });
});
