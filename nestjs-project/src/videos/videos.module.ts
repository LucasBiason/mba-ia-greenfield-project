import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { StorageModule } from '../storage/storage.module';
import { VIDEO_PROCESSING_QUEUE } from './constants';
import { Video } from './entities/video.entity';
import { FfmpegService } from './ffmpeg.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

/**
 * VideosModule -- encapsulates video upload, storage, and streaming.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Channel]),
    StorageModule,
    ConfigModule.forFeature(storageConfig),
    BullModule.registerQueue({
      name: VIDEO_PROCESSING_QUEUE,
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService, FfmpegService],
  exports: [VideosService, FfmpegService, TypeOrmModule, BullModule],
})
export class VideosModule {}
