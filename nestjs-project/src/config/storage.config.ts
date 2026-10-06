import { registerAs } from '@nestjs/config';

/**
 * Storage configuration namespace ("storage").
 *
 * Configures connection parameters for MinIO / S3 Object Storage.
 * Sourced through ConfigModule (never raw process.env in domain/application code).
 */
export interface StorageConfig {
  endpoint: string;
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
    endpoint: process.env.STORAGE_ENDPOINT || 'http://storage:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    bucketVideos: process.env.STORAGE_BUCKET_VIDEOS || 'videos',
    bucketThumbnails: process.env.STORAGE_BUCKET_THUMBNAILS || 'thumbnails',
    useSSL: process.env.STORAGE_USE_SSL === 'true',
    region: process.env.STORAGE_REGION || 'us-east-1',
  }),
);
