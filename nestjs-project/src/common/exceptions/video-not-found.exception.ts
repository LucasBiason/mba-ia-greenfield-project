import { DomainException } from './domain.exception';

/**
 * Raised when a requested video does not exist.
 */
export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}
