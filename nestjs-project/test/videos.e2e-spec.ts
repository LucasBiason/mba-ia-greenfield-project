import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { Channel } from '../src/channels/entities/channel.entity';
import { User } from '../src/users/entities/user.entity';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/enums/video-status.enum';
import { VideoVisibility } from '../src/videos/enums/video-visibility.enum';
import { StorageService } from '../src/storage/storage.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let authService: AuthService;
  let storageService: StorageService;
  let videoRepository: Repository<Video>;
  let userRepository: Repository<User>;

  let ownerToken: string;
  let ownerUser: User;
  let ownerChannel: Channel;

  let otherToken: string;
  let otherUser: User;
  let otherChannel: Channel;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    authService = moduleFixture.get(AuthService);
    storageService = moduleFixture.get(StorageService);
    videoRepository = dataSource.getRepository(Video);
    userRepository = dataSource.getRepository(User);

    await storageService.ensureBucketsExist();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);

    // 1. Create owner user & login
    const ownerReg = await authService.register({
      email: 'owner@streamtube.local',
      password: 'password123',
    });
    await userRepository.update(ownerReg.id, { is_confirmed: true });
    const ownerLogin = await authService.login({
      email: 'owner@streamtube.local',
      password: 'password123',
    });
    ownerToken = ownerLogin.access_token;
    ownerUser = (await userRepository.findOne({
      where: { id: ownerReg.id },
      relations: ['channel'],
    }))!;
    ownerChannel = ownerUser.channel;

    // 2. Create other user & login
    const otherReg = await authService.register({
      email: 'other@streamtube.local',
      password: 'password123',
    });
    await userRepository.update(otherReg.id, { is_confirmed: true });
    const otherLogin = await authService.login({
      email: 'other@streamtube.local',
      password: 'password123',
    });
    otherToken = otherLogin.access_token;
    otherUser = (await userRepository.findOne({
      where: { id: otherReg.id },
      relations: ['channel'],
    }))!;
    otherChannel = otherUser.channel;
  });

  describe('POST /videos/upload/init', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .send({
          channelId: ownerChannel.id,
          fileName: 'video.mp4',
          fileSize: 1000,
          mimeType: 'video/mp4',
        });

      expect(res.status).toBe(401);
    });

    it('should return 415 when MIME type is unsupported (e.g. video/x-msvideo)', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          fileName: 'video.avi',
          fileSize: 1000,
          mimeType: 'video/x-msvideo',
        });

      expect(res.status).toBe(415);
      expect(res.body.error).toBe('UNSUPPORTED_VIDEO_FORMAT');
    });

    it('should return 400 when file size exceeds 10GB limit', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          fileName: 'large.mp4',
          fileSize: 11 * 1024 * 1024 * 1024, // 11GB
          mimeType: 'video/mp4',
        });

      expect(res.status).toBe(400);
    });

    it('should return 403 when trying to init upload for another user channel (anti-IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: otherChannel.id,
          fileName: 'attack.mp4',
          fileSize: 1000,
          mimeType: 'video/mp4',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CHANNEL_OWNERSHIP_ERROR');
    });

    it('should return 404 when channelId does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: 'a0000000-0000-4000-8000-000000000000',
          fileName: 'test.mp4',
          fileSize: 1000,
          mimeType: 'video/mp4',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CHANNEL_NOT_FOUND');
    });

    it('should return 201 with UploadResponseDto on valid request', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          title: 'My E2E Video',
          fileName: 'test.mp4',
          fileSize: 5000000,
          mimeType: 'video/mp4',
          idempotencyKey: 'idemp-e2e-1',
        });

      expect(res.status).toBe(201);
      expect(res.body.publicId).toHaveLength(12);
      expect(res.body.uploadUrl).toBe(`/videos/upload/${res.body.id}`);
      expect(res.body.status).toBe(VideoStatus.DRAFT);

      // Idempotency: duplicate request returns the same record
      const dup = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          title: 'My E2E Video',
          fileName: 'test.mp4',
          fileSize: 5000000,
          mimeType: 'video/mp4',
          idempotencyKey: 'idemp-e2e-1',
        });

      expect(dup.status).toBe(201);
      expect(dup.body.id).toBe(res.body.id);
      expect(dup.body.publicId).toBe(res.body.publicId);
    });
  });

  describe('Tus protocol endpoints (/videos/upload)', () => {
    it('should respond to OPTIONS /videos/upload with Tus protocol headers', async () => {
      const res = await request(app.getHttpServer())
        .options('/videos/upload')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['tus-resumable']).toBe('1.0.0');
    });

    it('should reject POST /videos/upload if videoId is missing in Upload-Metadata', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/upload')
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', '1024')
        .set('Upload-Metadata', 'filename dGVzdC5tcDQ=');

      expect(res.status).toBe(400);
    });

    it('should reject POST /videos/upload if videoId does not exist in DB', async () => {
      const b64Missing = Buffer.from(
        '00000000-0000-0000-0000-000000000000',
      ).toString('base64');
      const res = await request(app.getHttpServer())
        .post('/videos/upload')
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', '1024')
        .set('Upload-Metadata', `videoId ${b64Missing}`);

      expect(res.status).toBe(404);
    });

    it('should perform a real tus chunk upload against MinIO and trigger onUploadFinish', async () => {
      // 1. Initialize draft video
      const initRes = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          title: 'Real Tus Video',
          fileName: 'chunk-test.mp4',
          fileSize: 12,
          mimeType: 'video/mp4',
        });
      expect(initRes.status).toBe(201);
      const videoId = initRes.body.id;

      // 2. POST /videos/upload (create upload)
      const b64Vid = Buffer.from(videoId).toString('base64');
      const createRes = await request(app.getHttpServer())
        .post('/videos/upload')
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', '12')
        .set('Upload-Metadata', `videoId ${b64Vid}`)
        .send();

      expect(createRes.status).toBe(201);
      const location = createRes.headers['location'];
      expect(location).toBeDefined();

      const uploadPath = location.startsWith('http')
        ? new URL(location).pathname
        : location;

      // Verify video status transitioned to UPLOADING in DB
      const dbVideoUploading = await videoRepository.findOne({
        where: { id: videoId },
      });
      expect(dbVideoUploading?.status).toBe(VideoStatus.UPLOADING);

      // 3. PATCH the chunk (12 bytes)
      const chunkData = Buffer.from('tus-payload!');
      const patchRes = await request(app.getHttpServer())
        .patch(uploadPath)
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Offset', '0')
        .set('Content-Type', 'application/offset+octet-stream')
        .send(chunkData);

      expect(patchRes.status).toBe(204);
      expect(patchRes.headers['upload-offset']).toBe('12');

      // 4. Verify onUploadFinish updated the video status in DB to PROCESSING
      const dbVideoFinished = await videoRepository.findOne({
        where: { id: videoId },
      });
      expect(dbVideoFinished?.status).toBe(VideoStatus.PROCESSING);
    });
  });

  describe('POST /videos/:publicId/complete', () => {
    it('should return 401 when no token is sent', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos/testPub12345/complete')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should return 403 when non-owner calls complete', async () => {
      const initRes = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          fileName: 'test.mp4',
          fileSize: 1000,
          mimeType: 'video/mp4',
        });

      const res = await request(app.getHttpServer())
        .post(`/videos/${initRes.body.publicId}/complete`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('should transition video to PROCESSING for owner', async () => {
      const initRes = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          fileName: 'test.mp4',
          fileSize: 1000,
          mimeType: 'video/mp4',
        });

      const validStorageKey = `videos/${initRes.body.publicId}/custom-key.mp4`;
      const res = await request(app.getHttpServer())
        .post(`/videos/${initRes.body.publicId}/complete`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ storageKey: validStorageKey, fileSize: 1000 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(VideoStatus.PROCESSING);
      expect(res.body.publicId).toBe(initRes.body.publicId);
      // Response DTO must not leak internal UUID or internal storage key
      expect(res.body.id).toBeUndefined();
      expect(res.body.video_key).toBeUndefined();
    });
  });

  describe('GET /videos/:publicId/stream (RFC 7233 Range requests)', () => {
    it('should return 409 Conflict when video is not in READY status', async () => {
      const initRes = await request(app.getHttpServer())
        .post('/videos/upload/init')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          channelId: ownerChannel.id,
          fileName: 'test.mp4',
          fileSize: 1000,
          mimeType: 'video/mp4',
        });

      const res = await request(app.getHttpServer()).get(
        `/videos/${initRes.body.publicId}/stream`,
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('VIDEO_NOT_READY');
    });

    it('should return 200 for full content and 206 for Range partial content when READY', async () => {
      const publicId = 'streamE2e123';
      const key = `videos/${publicId}/video.mp4`;
      const videoContent = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'); // 36 bytes

      // Upload binary to MinIO
      await storageService.uploadBuffer(
        key,
        videoContent,
        'video/mp4',
        storageService.videosBucket,
      );

      // Save video as READY in DB
      await videoRepository.save(
        videoRepository.create({
          public_id: publicId,
          channel_id: ownerChannel.id,
          title: 'Streaming Test',
          original_filename: 'video.mp4',
          file_size: '36',
          video_key: key,
          status: VideoStatus.READY,
          visibility: VideoVisibility.PUBLIC,
        }),
      );

      // 1. Full stream (200 OK)
      const fullRes = await request(app.getHttpServer()).get(
        `/videos/${publicId}/stream`,
      );
      expect(fullRes.status).toBe(200);
      expect(fullRes.headers['content-type']).toBe('video/mp4');
      expect(fullRes.headers['accept-ranges']).toBe('bytes');
      expect(fullRes.body.toString('utf8')).toBe(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      );

      // 2. Partial Range stream (206 Partial Content)
      const rangeRes = await request(app.getHttpServer())
        .get(`/videos/${publicId}/stream`)
        .set('Range', 'bytes=0-9');

      expect(rangeRes.status).toBe(206);
      expect(rangeRes.headers['content-range']).toBe('bytes 0-9/36');
      expect(rangeRes.headers['content-length']).toBe('10');
      expect(rangeRes.body.toString('utf8')).toBe('ABCDEFGHIJ');
    });
  });

  describe('GET /videos/:publicId/download', () => {
    it('should return 200 with Content-Disposition attachment header', async () => {
      const publicId = 'downE2e12345';
      const key = `videos/${publicId}/file.mp4`;
      const content = Buffer.from('download-binary-payload');

      await storageService.uploadBuffer(
        key,
        content,
        'video/mp4',
        storageService.videosBucket,
      );

      await videoRepository.save(
        videoRepository.create({
          public_id: publicId,
          channel_id: ownerChannel.id,
          title: 'Download Test',
          original_filename: 'my-custom-video.mp4',
          file_size: String(content.length),
          video_key: key,
          status: VideoStatus.READY,
          visibility: VideoVisibility.PUBLIC,
        }),
      );

      const res = await request(app.getHttpServer()).get(
        `/videos/${publicId}/download`,
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="my-custom-video.mp4"',
      );
      expect(res.headers['content-type']).toBe('video/mp4');
      expect(res.body.toString('utf8')).toBe('download-binary-payload');
    });
  });

  describe('PATCH /videos/:publicId and Private Visibility rules', () => {
    it('should enforce authentication, authorization, and private visibility', async () => {
      const publicId = 'privE2e12345';
      await videoRepository.save(
        videoRepository.create({
          public_id: publicId,
          channel_id: ownerChannel.id,
          title: 'Private Video',
          original_filename: 'secret.mp4',
          file_size: '1000',
          video_key: `videos/${publicId}/secret.mp4`,
          status: VideoStatus.READY,
          visibility: VideoVisibility.PRIVATE,
        }),
      );

      // Anonymous cannot get private video
      const anonGet = await request(app.getHttpServer()).get(
        `/videos/${publicId}`,
      );
      expect(anonGet.status).toBe(403);

      // Other user cannot get private video
      const otherGet = await request(app.getHttpServer())
        .get(`/videos/${publicId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(otherGet.status).toBe(403);

      // Owner can get private video
      const ownerGet = await request(app.getHttpServer())
        .get(`/videos/${publicId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerGet.status).toBe(200);
      expect(ownerGet.body.publicId).toBe(publicId);

      // Update metadata requires owner
      const updateDenied = await request(app.getHttpServer())
        .patch(`/videos/${publicId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hacked' });
      expect(updateDenied.status).toBe(403);

      const updateAllowed = await request(app.getHttpServer())
        .patch(`/videos/${publicId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'New Official Title',
          visibility: VideoVisibility.PUBLIC,
        });
      expect(updateAllowed.status).toBe(200);
      expect(updateAllowed.body.title).toBe('New Official Title');
      expect(updateAllowed.body.visibility).toBe(VideoVisibility.PUBLIC);

      // Now it's PUBLIC, anonymous can access it
      const anonGetAfter = await request(app.getHttpServer()).get(
        `/videos/${publicId}`,
      );
      expect(anonGetAfter.status).toBe(200);
    });
  });
});
