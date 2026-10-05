import { registerAs } from '@nestjs/config';

/**
 * Storage configuration namespace ("storage").
 *
 * Configures connection parameters for MinIO / S3 Object Storage (TD-6.1 / ADR-0001 / ADR-0004).
 * Sourced through ConfigModule (never raw process.env in domain/application code).
 */
export interface StorageConfig {
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  bucketVideos: string;
  bucketThumbnails: string;
  useSSL: boolean;
  region: string;
}

export default registerAs(
  'storage',
  (): StorageConfig => ({
    endpoint:
      process.env.MINIO_ENDPOINT ||
      process.env.STORAGE_ENDPOINT ||
      'http://storage:9000',
    port: Number(process.env.MINIO_PORT || process.env.STORAGE_PORT || 9000),
    accessKey:
      process.env.MINIO_ACCESS_KEY ||
      process.env.STORAGE_ACCESS_KEY ||
      process.env.MINIO_ROOT_USER ||
      'minioadmin',
    secretKey:
      process.env.MINIO_SECRET_KEY ||
      process.env.STORAGE_SECRET_KEY ||
      process.env.MINIO_ROOT_PASSWORD ||
      'minioadmin',
    bucketVideos: process.env.STORAGE_BUCKET_VIDEOS || 'videos',
    bucketThumbnails: process.env.STORAGE_BUCKET_THUMBNAILS || 'thumbnails',
    useSSL:
      process.env.MINIO_USE_SSL === 'true' ||
      process.env.STORAGE_USE_SSL === 'true',
    region: process.env.STORAGE_REGION || 'us-east-1',
  }),
);
