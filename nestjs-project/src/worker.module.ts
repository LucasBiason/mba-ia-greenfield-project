import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import mailConfig from './config/mail.config';
import queueConfig from './config/queue.config';
import storageConfig from './config/storage.config';
import swaggerConfig from './config/swagger.config';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { VideosModule } from './videos/videos.module';
import { VideoProcessingProcessor } from './videos/processors/video-processing.processor';

/**
 * WorkerModule -- application context root for the standalone FFmpeg worker.
 * Runs without HTTP controllers/pipes/guards. Hosts BullMQ processor consumers.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        mailConfig,
        swaggerConfig,
        storageConfig,
        queueConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres' as const,
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    QueueModule,
    StorageModule,
    UsersModule,
    VideosModule,
  ],
  providers: [VideoProcessingProcessor],
})
export class WorkerModule {}
