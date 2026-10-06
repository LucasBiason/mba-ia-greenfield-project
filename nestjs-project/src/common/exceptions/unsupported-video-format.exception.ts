import { DomainException } from './domain.exception';

/**
 * Raised when an upload attempts to ingest a non-allowed video MIME format.
 */
export class UnsupportedVideoFormatException extends DomainException {
  constructor(mimeType: string) {
    super(
      'UNSUPPORTED_VIDEO_FORMAT',
      415,
      `Video format '${mimeType}' is not supported. Allowed formats: video/mp4, video/webm, video/quicktime`,
    );
  }
}
