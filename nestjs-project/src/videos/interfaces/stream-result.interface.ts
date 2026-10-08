import type { Readable } from 'stream';

export interface StreamResult {
  statusCode: number;
  headers: Record<string, string | number>;
  stream: Readable;
}
