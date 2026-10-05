import { DomainException } from './domain.exception';

/**
 * Raised when an upload payload exceeds the platform maximum size (10GB cap - REQ-SEC-07 / NFR02).
 */
export class FileTooLargeException extends DomainException {
  constructor(maxBytes: number = 10 * 1024 * 1024 * 1024) {
    super(
      'FILE_TOO_LARGE',
      413,
      `File exceeds maximum allowed size of ${maxBytes} bytes (10GB)`,
    );
  }
}
