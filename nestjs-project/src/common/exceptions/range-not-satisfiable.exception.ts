import { DomainException } from './domain.exception';

/**
 * Raised when an HTTP Range request header cannot be satisfied (RFC 7233 - 416).
 */
export class RangeNotSatisfiableException extends DomainException {
  constructor(totalSize: number) {
    super(
      'RANGE_NOT_SATISFIABLE',
      416,
      `Requested range not satisfiable for content length ${totalSize}`,
    );
  }
}
