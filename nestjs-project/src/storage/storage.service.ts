import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import storageConfig from '../config/storage.config';
import { RangeNotSatisfiableException } from '../common/exceptions/range-not-satisfiable.exception';

export interface StreamResult {
  statusCode: number;
  headers: Record<string, string | number>;
  stream: Readable;
}

/**
 * StorageService -- encapsulates MinIO / S3 Object Storage operations.
 *
 * Configured with `forcePathStyle: true` for MinIO compatibility.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.s3Client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true,
      tls: this.config.useSSL,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucketsExist();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Storage bucket initialization notice: ${message}`);
    }
  }

  get client(): S3Client {
    return this.s3Client;
  }

  get videosBucket(): string {
    return this.config.bucketVideos;
  }

  get thumbnailsBucket(): string {
    return this.config.bucketThumbnails;
  }

  /**
   * Ensures that required buckets (videos, thumbnails) exist in the storage provider.
   */
  async ensureBucketsExist(): Promise<void> {
    const buckets = [this.config.bucketVideos, this.config.bucketThumbnails];

    for (const bucket of buckets) {
      try {
        await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Created storage bucket: '${bucket}'`);
        } catch (createErr: unknown) {
          const createMsg =
            createErr instanceof Error ? createErr.message : String(createErr);
          this.logger.warn(`Could not create bucket '${bucket}': ${createMsg}`);
        }
      }
    }
  }

  /**
   * Generates a time-limited presigned download URL with optional Content-Disposition attachment filename.
   */
  async getSignedDownloadUrl(
    key: string,
    filename?: string,
    expiresIn = 3600,
    bucket: string = this.config.bucketVideos,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename="${filename}"`
        : undefined,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Parses an RFC 7233 HTTP Range header.
   */
  parseRange(
    rangeHeader: string,
    totalSize: number,
  ): { start: number; end: number } | null {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      return null;
    }

    const startStr = match[1];
    const endStr = match[2];

    if (startStr === '' && endStr === '') {
      return null;
    }

    let start: number;
    let end: number;

    if (startStr === '') {
      const suffixLength = parseInt(endStr, 10);
      if (isNaN(suffixLength) || suffixLength <= 0) {
        return null;
      }
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    } else if (endStr === '') {
      start = parseInt(startStr, 10);
      end = totalSize - 1;
    } else {
      start = parseInt(startStr, 10);
      end = parseInt(endStr, 10);
    }

    if (isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
      throw new RangeNotSatisfiableException(totalSize);
    }

    end = Math.min(end, totalSize - 1);
    return { start, end };
  }

  /**
   * Retrieves a video stream supporting RFC 7233 Range headers (HTTP 206 Partial Content).
   */
  async getVideoStream(
    key: string,
    rangeHeader?: string,
    bucket: string = this.config.bucketVideos,
  ): Promise<StreamResult> {
    const head = await this.s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const totalSize = head.ContentLength ?? 0;
    const rawContentType = head.ContentType;
    let contentType =
      rawContentType &&
      rawContentType !== 'binary/octet-stream' &&
      rawContentType !== 'application/octet-stream'
        ? rawContentType
        : undefined;

    if (!contentType) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.endsWith('.webm')) {
        contentType = 'video/webm';
      } else if (lowerKey.endsWith('.mov')) {
        contentType = 'video/quicktime';
      } else {
        contentType = 'video/mp4';
      }
    }

    if (rangeHeader && totalSize > 0) {
      const range = this.parseRange(rangeHeader, totalSize);
      if (range) {
        const { start, end } = range;
        const chunkSize = end - start + 1;
        const s3Response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            Range: `bytes=${start}-${end}`,
          }),
        );

        return {
          statusCode: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
          },
          stream: s3Response.Body as Readable,
        };
      }
    }

    const s3Response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const headers: Record<string, string | number> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    };
    if (totalSize > 0) {
      headers['Content-Length'] = totalSize;
    }

    return {
      statusCode: 200,
      headers,
      stream: s3Response.Body as Readable,
    };
  }

  /**
   * Retrieves an object from storage with optional byte-range support (for HTTP 206 Partial Content).
   */
  async getObject(
    key: string,
    bucket: string = this.config.bucketVideos,
    range?: string,
  ): Promise<GetObjectCommandOutput> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: range,
    });
    return this.s3Client.send(command);
  }

  /**
   * Uploads a Buffer directly to storage (used for generated thumbnails or metadata).
   */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    bucket: string = this.config.bucketThumbnails,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await this.s3Client.send(command);
  }
}
