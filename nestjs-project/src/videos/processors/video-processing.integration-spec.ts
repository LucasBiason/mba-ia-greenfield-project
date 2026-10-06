jest.mock('@tus/server', () => ({
  Server: jest.fn().mockImplementation(() => ({
    handle: jest.fn(),
  })),
}));
jest.mock('@tus/s3-store', () => ({
  S3Store: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import appConfig from '../../config/app.config';
import authConfig from '../../config/auth.config';
import databaseConfig from '../../config/database.config';
import queueConfig from '../../config/queue.config';
import storageConfig from '../../config/storage.config';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { QueueModule } from '../../queue/queue.module';
import { StorageModule } from '../../storage/storage.module';
import { StorageService } from '../../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { PROCESS_VIDEO_JOB, VIDEO_PROCESSING_QUEUE } from '../constants';
import { Video } from '../entities/video.entity';
import { VideoStatus } from '../enums/video-status.enum';
import { VideoVisibility } from '../enums/video-visibility.enum';
import { FfmpegService } from '../ffmpeg.service';
import { VideoProcessingProcessor } from './video-processing.processor';
import { VideosModule } from '../videos.module';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideoProcessingProcessor (integration - Redis + FFmpeg real)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let processor: VideoProcessingProcessor;
  let storageService: StorageService;
  let ffmpegService: FfmpegService;
  let videoRepository: Repository<Video>;
  let channelRepository: Repository<Channel>;
  let userRepository: Repository<User>;
  let videoQueue: Queue;

  let testUser: User;
  let testChannel: Channel;
  let sampleVideoPath: string;
  let sampleVideoBuffer: Buffer;

  beforeAll(async () => {
    // 1. Generate a small real 2-second H.264 MP4 file using local FFmpeg
    sampleVideoPath = path.join(
      os.tmpdir(),
      `integration_test_${Date.now()}.mp4`,
    );
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=30 -t 2 -c:v libx264 -pix_fmt yuv420p "${sampleVideoPath}"`,
      { stdio: 'pipe' },
    );
    sampleVideoBuffer = fs.readFileSync(sampleVideoPath);

    const ds = createTestDataSource(ALL_ENTITIES);
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            appConfig,
            authConfig,
            databaseConfig,
            storageConfig,
            queueConfig,
          ],
        }),
        TypeOrmModule.forRoot(ds.options),
        QueueModule,
        StorageModule,
        VideosModule,
      ],
      providers: [VideoProcessingProcessor],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    processor = moduleRef.get(VideoProcessingProcessor);
    storageService = moduleRef.get(StorageService);
    ffmpegService = moduleRef.get(FfmpegService);
    videoQueue = moduleRef.get<Queue>(getQueueToken(VIDEO_PROCESSING_QUEUE));
    videoRepository = dataSource.getRepository(Video);
    channelRepository = dataSource.getRepository(Channel);
    userRepository = dataSource.getRepository(User);

    await storageService.ensureBucketsExist();
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(sampleVideoPath)) {
        fs.unlinkSync(sampleVideoPath);
      }
    } catch {
      // ignore
    }
    if (videoQueue) {
      await videoQueue.close();
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);

    testUser = await userRepository.save(
      userRepository.create({
        email: 'ffmpeg-tester@example.com',
        password: 'password123',
        is_confirmed: true,
      }),
    );

    testChannel = await channelRepository.save(
      channelRepository.create({
        name: 'FFmpeg Channel',
        nickname: 'ffmpeg_channel',
        user_id: testUser.id,
      }),
    );
  });

  it('should extract metadata and generate a thumbnail with real FFmpeg', async () => {
    const metadata = await ffmpegService.extractMetadata(sampleVideoPath);
    expect(metadata.duration).toBeGreaterThanOrEqual(1);
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(360);
    expect(metadata.codec).toBe('h264');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-test-'));
    try {
      const thumbPath = await ffmpegService.generateThumbnail(
        sampleVideoPath,
        tempDir,
        'thumb.jpg',
        1,
        '1280x720',
      );

      expect(fs.existsSync(thumbPath)).toBe(true);
      const thumbStat = fs.statSync(thumbPath);
      expect(thumbStat.size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should process a video end-to-end: upload to MinIO, run processor, update DB to READY', async () => {
    // 1. Create Video record in DB in UPLOADING status
    const publicId = 'procTest1234';
    const videoKey = `videos/${publicId}/sample.mp4`;

    const video = await videoRepository.save(
      videoRepository.create({
        public_id: publicId,
        channel_id: testChannel.id,
        title: 'Integration Processing Test',
        original_filename: 'sample.mp4',
        file_size: String(sampleVideoBuffer.length),
        video_key: videoKey,
        status: VideoStatus.UPLOADING,
        visibility: VideoVisibility.PUBLIC,
      }),
    );

    // 2. Upload sample video buffer to MinIO videos bucket
    await storageService.uploadBuffer(
      videoKey,
      sampleVideoBuffer,
      'video/mp4',
      storageService.videosBucket,
    );

    // 3. Create mock BullMQ job and process
    const mockJob: any = {
      id: 'job-ffmpeg-1',
      data: {
        videoId: video.id,
        videoKey,
        channelId: testChannel.id,
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    await processor.process(mockJob);

    // 4. Verify Video in DB is now READY
    const updated = await videoRepository.findOne({ where: { id: video.id } });
    expect(updated).toBeDefined();
    expect(updated?.status).toBe(VideoStatus.READY);
    expect(updated?.duration_in_seconds).toBeGreaterThanOrEqual(1);
    expect(updated?.thumbnail_key).toBe(`thumbnails/${publicId}/thumbnail.jpg`);
    expect(updated?.metadata).toMatchObject({
      width: 640,
      height: 360,
      codec: 'h264',
    });

    // 5. Verify thumbnail was actually uploaded to MinIO thumbnails bucket
    const thumbObj = await storageService.getObject(
      `thumbnails/${publicId}/thumbnail.jpg`,
      storageService.thumbnailsBucket,
    );
    expect(thumbObj.Body).toBeDefined();
    expect(thumbObj.ContentType).toBe('image/jpeg');
  });

  it('should enqueue and verify job in real Redis BullMQ queue', async () => {
    const job = await videoQueue.add(
      PROCESS_VIDEO_JOB,
      {
        videoId: 'vid-redis-test',
        videoKey: 'videos/redis/test.mp4',
        channelId: testChannel.id,
      },
      { removeOnComplete: true },
    );

    expect(job.id).toBeDefined();

    const retrievedJob = await videoQueue.getJob(job.id!);
    if (retrievedJob) {
      expect(retrievedJob.data.videoId).toBe('vid-redis-test');
    }
  });

  afterAll(async () => {
    try {
      if (sampleVideoPath && fs.existsSync(sampleVideoPath)) {
        fs.unlinkSync(sampleVideoPath);
      }
    } catch {
      // Ignore file deletion errors
    }
    if (videoQueue) {
      await videoQueue.close();
    }
    if (moduleRef) {
      await moduleRef.close();
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });
});
