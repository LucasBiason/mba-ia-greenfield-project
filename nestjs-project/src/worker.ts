import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Standalone worker entrypoint.
 * Boots an application context without an HTTP server (`createApplicationContext`),
 * initializing BullMQ workers and listening for video processing events.
 */
async function bootstrapWorker(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  logger.log('Bootstrapping StreamTube FFmpeg Worker standalone context...');

  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  logger.log('StreamTube FFmpeg Worker is running and listening for jobs.');
}

bootstrapWorker().catch((err) => {
  const logger = new Logger('WorkerBootstrap');
  logger.error('Failed to start StreamTube Worker:', err);
  process.exit(1);
});
