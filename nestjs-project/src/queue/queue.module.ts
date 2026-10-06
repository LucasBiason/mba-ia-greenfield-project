import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import queueConfig from '../config/queue.config';

/**
 * QueueModule -- Global configuration for BullMQ Redis connection.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [queueConfig.KEY],
      useFactory: (qConfig: ConfigType<typeof queueConfig>) => ({
        connection: {
          host: qConfig.host,
          port: qConfig.port,
          password: qConfig.password,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
