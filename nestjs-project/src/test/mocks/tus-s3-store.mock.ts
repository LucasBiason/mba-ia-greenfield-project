import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface S3ClientCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3StoreConfig {
  bucket?: string;
  endpoint?: string;
  region?: string;
  credentials?: S3ClientCredentials;
  forcePathStyle?: boolean;
  tls?: boolean;
}

export interface S3StoreOptions {
  bucket?: string;
  s3ClientConfig?: S3StoreConfig;
}

export interface UploadRecord {
  size: number;
  offset: number;
  metadata: Record<string, string>;
  chunks: Buffer[];
}

export class S3Store {
  public readonly s3Client?: S3Client;
  public readonly bucket: string;
  private readonly uploads = new Map<string, UploadRecord>();

  constructor(public readonly options?: S3StoreOptions) {
    if (options?.s3ClientConfig) {
      const cfg = options.s3ClientConfig;
      this.bucket = cfg.bucket || 'videos';
      this.s3Client = new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        credentials: cfg.credentials,
        forcePathStyle: cfg.forcePathStyle,
        tls: cfg.tls,
      });
    } else {
      this.bucket = 'videos';
    }
  }

  create(
    id: string,
    size: number,
    metadata: Record<string, string>,
  ): Promise<void> {
    this.uploads.set(id, { size, offset: 0, metadata, chunks: [] });
    return Promise.resolve();
  }

  get(id: string): UploadRecord | undefined {
    return this.uploads.get(id);
  }

  async write(id: string, chunk: Buffer): Promise<number> {
    let upload = this.uploads.get(id);
    if (!upload) {
      upload = { size: chunk.length, offset: 0, metadata: {}, chunks: [] };
      this.uploads.set(id, upload);
    }
    upload.chunks.push(chunk);
    upload.offset += chunk.length;
    if (this.s3Client && upload.offset >= upload.size) {
      const fullBuffer = Buffer.concat(upload.chunks);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: id,
          Body: fullBuffer,
          ContentType: 'video/mp4',
        }),
      );
    }
    return upload.offset;
  }
}
