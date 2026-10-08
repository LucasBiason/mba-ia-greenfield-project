import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { Readable } from 'stream';
import storageConfig from '../config/storage.config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import { RangeNotSatisfiableException } from '../common/exceptions/range-not-satisfiable.exception';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('StorageService (integration - MinIO real)', () => {
  let moduleRef: TestingModule;
  let service: StorageService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig],
        }),
        StorageModule,
      ],
    }).compile();

    service = moduleRef.get(StorageService);
    await service.ensureBucketsExist();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should ensure videos and thumbnails buckets exist in MinIO', async () => {
    await expect(service.ensureBucketsExist()).resolves.not.toThrow();
  });

  it('should upload a buffer to thumbnails bucket and retrieve it via getObject', async () => {
    const key = `integration-tests/test-thumb-${Date.now()}.jpg`;
    const data = Buffer.from('fake-jpeg-image-bytes-integration');

    await service.uploadBuffer(key, data, 'image/jpeg');

    const output = await service.getObject(key, service.thumbnailsBucket);
    expect(output.Body).toBeDefined();

    const retrieved = await streamToBuffer(output.Body as Readable);
    expect(retrieved.equals(data)).toBe(true);
    expect(output.ContentType).toBe('image/jpeg');
  });

  it('should serve full content (HTTP 200) when no Range header is provided', async () => {
    const key = `integration-tests/test-video-${Date.now()}.mp4`;
    const payload = Buffer.alloc(2048, 'a');

    // Upload directly using PutObjectCommand on videos bucket
    await service.uploadBuffer(key, payload, 'video/mp4', service.videosBucket);

    const result = await service.getVideoStream(key);
    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toBe('video/mp4');
    expect(result.headers['Content-Length']).toBe(2048);
    expect(result.headers['Accept-Ranges']).toBe('bytes');

    const retrieved = await streamToBuffer(result.stream);
    expect(retrieved.length).toBe(2048);
  });

  it('should serve partial content (HTTP 206) when a valid Range header is requested', async () => {
    const key = `integration-tests/test-range-${Date.now()}.mp4`;
    const payload = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'); // 36 bytes

    await service.uploadBuffer(key, payload, 'video/mp4', service.videosBucket);

    // Request bytes 0 to 9 (10 bytes)
    const result = await service.getVideoStream(key, 'bytes=0-9');

    expect(result.statusCode).toBe(206);
    expect(result.headers['Content-Range']).toBe('bytes 0-9/36');
    expect(result.headers['Content-Length']).toBe(10);
    expect(result.headers['Accept-Ranges']).toBe('bytes');

    const chunk = await streamToBuffer(result.stream);
    expect(chunk.toString('utf8')).toBe('0123456789');
  });

  it('should throw RangeNotSatisfiableException when Range is out of bounds', async () => {
    const key = `integration-tests/test-oob-${Date.now()}.mp4`;
    const payload = Buffer.from('short-content'); // 13 bytes

    await service.uploadBuffer(key, payload, 'video/mp4', service.videosBucket);

    await expect(service.getVideoStream(key, 'bytes=50-100')).rejects.toThrow(
      RangeNotSatisfiableException,
    );
  });

  it('should generate a presigned download URL with Content-Disposition attachment', async () => {
    const key = 'test-video.mp4';
    const url = await service.getSignedDownloadUrl(key, 'my-download.mp4');

    expect(url).toContain('http');
    expect(url).toContain(
      encodeURIComponent('attachment; filename="my-download.mp4"'),
    );
    expect(url).toContain('X-Amz-Signature');
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });
});
