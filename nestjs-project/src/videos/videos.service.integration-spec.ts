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
import { VIDEO_PROCESSING_QUEUE } from './constants';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import databaseConfig from '../config/database.config';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { ChannelNotFoundException } from '../common/exceptions/channel-not-found.exception';
import { ChannelOwnershipException } from '../common/exceptions/channel-ownership.exception';
import { FileTooLargeException } from '../common/exceptions/file-too-large.exception';
import { UnsupportedVideoFormatException } from '../common/exceptions/unsupported-video-format.exception';
import { VideoNotFoundException } from '../common/exceptions/video-not-found.exception';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import {
  InitUploadDto,
  MAX_VIDEO_FILE_SIZE_BYTES,
} from './dto/init-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { Video } from './entities/video.entity';
import { VideoStatus } from './enums/video-status.enum';
import { VideoVisibility } from './enums/video-visibility.enum';
import { VideosModule } from './videos.module';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideosService (integration - Postgres real)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: VideosService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;

  let testUser: User;
  let anotherUser: User;
  let testChannel: Channel;
  let anotherChannel: Channel;

  beforeAll(async () => {
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
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(VideosService);
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    try {
      const queue = moduleRef.get<Queue>(getQueueToken(VIDEO_PROCESSING_QUEUE));
      if (queue) {
        await queue.close();
      }
    } catch {
      // ignore
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);

    // Seed test users and channels
    testUser = await userRepository.save(
      userRepository.create({
        email: 'creator@example.com',
        password: 'hash123',
        is_confirmed: true,
      }),
    );

    testChannel = await channelRepository.save(
      channelRepository.create({
        name: 'Creator Channel',
        nickname: 'creator_channel',
        user_id: testUser.id,
      }),
    );

    anotherUser = await userRepository.save(
      userRepository.create({
        email: 'other@example.com',
        password: 'hash456',
        is_confirmed: true,
      }),
    );

    anotherChannel = await channelRepository.save(
      channelRepository.create({
        name: 'Other Channel',
        nickname: 'other_channel',
        user_id: anotherUser.id,
      }),
    );
  });

  describe('initUpload', () => {
    it('should create and persist a video draft in PostgreSQL', async () => {
      const dto: InitUploadDto = {
        channelId: testChannel.id,
        title: 'Full Cycle NestJS Architecture',
        fileName: 'lesson-01.mp4',
        fileSize: 104857600, // 100MB
        mimeType: 'video/mp4',
        idempotencyKey: 'idemp-key-1',
      };

      const result = await service.initUpload(dto, testUser.id);

      expect(result.id).toBeDefined();
      expect(result.publicId).toHaveLength(12);
      expect(result.title).toBe(dto.title);
      expect(result.status).toBe(VideoStatus.DRAFT);
      expect(result.uploadUrl).toBe(`/videos/upload/${result.id}`);

      // Verify row persisted in database
      const row = await videoRepository.findOne({ where: { id: result.id } });
      expect(row).toBeDefined();
      expect(row?.public_id).toBe(result.publicId);
      expect(row?.channel_id).toBe(testChannel.id);
      expect(row?.file_size).toBe('104857600');
      expect(row?.original_filename).toBe('lesson-01.mp4');
      expect(row?.idempotency_key).toBe('idemp-key-1');
      expect(row?.status).toBe(VideoStatus.DRAFT);
    });

    it('should return existing draft on duplicate idempotencyKey (idempotent)', async () => {
      const dto: InitUploadDto = {
        channelId: testChannel.id,
        title: 'Initial Video',
        fileName: 'video.mp4',
        fileSize: 5000000,
        mimeType: 'video/mp4',
        idempotencyKey: 'same-token-123',
      };

      const first = await service.initUpload(dto, testUser.id);
      const second = await service.initUpload(dto, testUser.id);

      expect(first.id).toBe(second.id);
      expect(first.publicId).toBe(second.publicId);

      const count = await videoRepository.count({
        where: { idempotency_key: 'same-token-123' },
      });
      expect(count).toBe(1);
    });

    it('should throw ChannelOwnershipException when user does not own channel (anti-IDOR)', async () => {
      const dto: InitUploadDto = {
        channelId: anotherChannel.id,
        fileName: 'attack.mp4',
        fileSize: 1000,
        mimeType: 'video/mp4',
      };

      await expect(service.initUpload(dto, testUser.id)).rejects.toThrow(
        ChannelOwnershipException,
      );
    });

    it('should throw ChannelNotFoundException when channelId does not exist', async () => {
      const dto: InitUploadDto = {
        channelId: '00000000-0000-0000-0000-000000000000',
        fileName: 'test.mp4',
        fileSize: 1000,
        mimeType: 'video/mp4',
      };

      await expect(service.initUpload(dto, testUser.id)).rejects.toThrow(
        ChannelNotFoundException,
      );
    });

    it('should throw UnsupportedVideoFormatException on invalid mime type', async () => {
      const dto: InitUploadDto = {
        channelId: testChannel.id,
        fileName: 'test.avi',
        fileSize: 1000,
        mimeType: 'video/x-msvideo',
      };

      await expect(service.initUpload(dto, testUser.id)).rejects.toThrow(
        UnsupportedVideoFormatException,
      );
    });

    it('should throw FileTooLargeException when fileSize > 10GB', async () => {
      const dto: InitUploadDto = {
        channelId: testChannel.id,
        fileName: 'huge.mp4',
        fileSize: MAX_VIDEO_FILE_SIZE_BYTES + 1,
        mimeType: 'video/mp4',
      };

      await expect(service.initUpload(dto, testUser.id)).rejects.toThrow(
        FileTooLargeException,
      );
    });
  });

  describe('markUploadCompleted', () => {
    it('should update video to PROCESSING and record key and size', async () => {
      const initDto: InitUploadDto = {
        channelId: testChannel.id,
        fileName: 'demo.mp4',
        fileSize: 2000000,
        mimeType: 'video/mp4',
      };
      const draft = await service.initUpload(initDto, testUser.id);

      const completed = await service.markUploadCompleted(
        draft.id,
        'videos/completed-key.mp4',
        2500000,
      );

      expect(completed.status).toBe(VideoStatus.PROCESSING);
      expect(completed.video_key).toBe('videos/completed-key.mp4');
      expect(completed.file_size).toBe('2500000');

      const persisted = await videoRepository.findOne({
        where: { id: draft.id },
      });
      expect(persisted?.status).toBe(VideoStatus.PROCESSING);
    });

    it('should throw VideoNotFoundException for non-existent videoId', async () => {
      await expect(
        service.markUploadCompleted(
          '00000000-0000-0000-0000-000000000000',
          'some-key',
          1000,
        ),
      ).rejects.toThrow(VideoNotFoundException);
    });
  });

  describe('updateMetadata', () => {
    it('should update title, description and visibility in PostgreSQL', async () => {
      const initDto: InitUploadDto = {
        channelId: testChannel.id,
        fileName: 'demo.mp4',
        fileSize: 2000000,
        mimeType: 'video/mp4',
      };
      const draft = await service.initUpload(initDto, testUser.id);

      const updateDto: UpdateVideoDto = {
        title: 'Updated Title',
        description: 'Updated Description',
        visibility: VideoVisibility.PRIVATE,
      };

      const updated = await service.updateMetadata(
        draft.publicId,
        updateDto,
        testUser.id,
      );

      expect(updated.title).toBe('Updated Title');
      expect(updated.description).toBe('Updated Description');
      expect(updated.visibility).toBe(VideoVisibility.PRIVATE);

      const persisted = await videoRepository.findOne({
        where: { id: draft.id },
      });
      expect(persisted?.title).toBe('Updated Title');
      expect(persisted?.visibility).toBe(VideoVisibility.PRIVATE);
    });

    it('should throw ChannelOwnershipException when non-owner updates video', async () => {
      const initDto: InitUploadDto = {
        channelId: testChannel.id,
        fileName: 'demo.mp4',
        fileSize: 2000000,
        mimeType: 'video/mp4',
      };
      const draft = await service.initUpload(initDto, testUser.id);

      await expect(
        service.updateMetadata(
          draft.publicId,
          { title: 'Attacker Title' },
          anotherUser.id,
        ),
      ).rejects.toThrow(ChannelOwnershipException);
    });
  });

  describe('findAll and findByPublicId', () => {
    it('should filter private videos for unauthenticated / other users', async () => {
      const initDto: InitUploadDto = {
        channelId: testChannel.id,
        fileName: 'private.mp4',
        fileSize: 1000,
        mimeType: 'video/mp4',
      };
      const draft = await service.initUpload(initDto, testUser.id);
      await service.updateMetadata(
        draft.publicId,
        { visibility: VideoVisibility.PRIVATE },
        testUser.id,
      );

      // Other user cannot find private video
      await expect(
        service.findByPublicId(draft.publicId, anotherUser.id),
      ).rejects.toThrow(ChannelOwnershipException);

      // Anonymous cannot find private video
      await expect(service.findByPublicId(draft.publicId)).rejects.toThrow(
        ChannelOwnershipException,
      );

      // Owner can find private video
      const found = await service.findByPublicId(draft.publicId, testUser.id);
      expect(found.public_id).toBe(draft.publicId);

      // findAll for another user omits private video
      const listOther = await service.findAll(testChannel.id, anotherUser.id);
      expect(
        listOther.find((v) => v.public_id === draft.publicId),
      ).toBeUndefined();

      // findAll for owner includes private video
      const listOwner = await service.findAll(testChannel.id, testUser.id);
      expect(
        listOwner.find((v) => v.public_id === draft.publicId),
      ).toBeDefined();
    });
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });
});
