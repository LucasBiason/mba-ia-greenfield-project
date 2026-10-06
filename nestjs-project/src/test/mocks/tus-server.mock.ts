import type { IncomingMessage, ServerResponse } from 'http';
import { S3Store, type UploadRecord } from './tus-s3-store.mock';

export interface TusServerUpload {
  id: string;
  size: number;
  metadata: Record<string, string>;
}

export interface TusServerError {
  status_code?: number;
  body?: string;
}

export interface TusServerOptions {
  path?: string;
  datastore?: S3Store;
  onUploadCreate?: (
    req: IncomingMessage,
    upload: TusServerUpload,
  ) => Promise<unknown>;
  onUploadFinish?: (
    req: IncomingMessage,
    upload: TusServerUpload,
  ) => Promise<unknown>;
}

function parseMetadata(raw?: string): Record<string, string> {
  if (!raw) return {};
  const result: Record<string, string> = {};
  const pairs = raw.split(',');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const [key, b64Val] = trimmed.split(' ');
    if (key && b64Val) {
      try {
        result[key] = Buffer.from(b64Val, 'base64').toString('utf8');
      } catch {
        result[key] = b64Val;
      }
    }
  }
  return result;
}

export class Server {
  constructor(public readonly options?: TusServerOptions) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase();
    const url = req.url || '';

    // Tus protocol headers
    res.setHeader('Tus-Resumable', '1.0.0');
    res.setHeader('Tus-Version', '1.0.0');
    res.setHeader('Tus-Extension', 'creation,termination');
    res.setHeader('Tus-Max-Size', '10737418240');

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const datastore = this.options?.datastore;

    if (method === 'POST') {
      const lengthHeader = req.headers['upload-length'];
      const size = lengthHeader ? parseInt(String(lengthHeader), 10) : 0;
      const metadata = parseMetadata(req.headers['upload-metadata'] as string);
      const uploadId = `tus_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const upload: TusServerUpload = {
        id: uploadId,
        size,
        metadata,
      };

      if (this.options?.onUploadCreate) {
        try {
          await this.options.onUploadCreate(req, upload);
        } catch (err: unknown) {
          const tusErr = err as TusServerError | undefined;
          res.statusCode = tusErr?.status_code || 400;
          res.end(tusErr?.body || 'Upload rejected\n');
          return;
        }
      }

      if (datastore && typeof datastore.create === 'function') {
        await datastore.create(uploadId, size, metadata);
      }

      res.setHeader('Location', `/videos/upload/${uploadId}`);
      res.statusCode = 201;
      res.end();
      return;
    }

    const parts = url.split('/');
    const uploadId = parts[parts.length - 1]?.split('?')[0] || '';

    if (method === 'HEAD') {
      const upload = datastore?.get(uploadId);
      res.setHeader('Upload-Offset', String(upload?.offset ?? 0));
      res.setHeader('Upload-Length', String(upload?.size ?? 0));
      res.statusCode = 200;
      res.end();
      return;
    }

    if (method === 'PATCH') {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve());
        req.on('error', (e: Error) => reject(e));
      });
      const body = Buffer.concat(chunks);

      let offset = body.length;
      if (datastore && typeof datastore.write === 'function') {
        try {
          offset = await datastore.write(uploadId, body);
        } catch {
          offset = body.length;
        }
      }

      const upload: UploadRecord | undefined = datastore?.get(uploadId);
      const totalSize = upload?.size ?? offset;

      res.setHeader('Upload-Offset', String(offset));
      res.statusCode = 204;
      res.end();

      if (offset >= totalSize && this.options?.onUploadFinish) {
        try {
          await this.options.onUploadFinish(req, {
            id: uploadId,
            size: totalSize,
            metadata: upload?.metadata || {},
          });
        } catch {
          // Ignore finish hook errors in response
        }
      }
      return;
    }

    res.statusCode = 405;
    res.end();
  }
}
