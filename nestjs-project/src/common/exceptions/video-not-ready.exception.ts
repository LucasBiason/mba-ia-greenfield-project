import { DomainException } from './domain.exception';

/**
 * Raised when an operation (like streaming) is attempted on a video that is not yet ready.
 */
export class VideoNotReadyException extends DomainException {
  constructor(status: string) {
    super(
      'VIDEO_NOT_READY',
      409,
      `Video is not ready for playback (current status: ${status})`,
    );
  }
}
