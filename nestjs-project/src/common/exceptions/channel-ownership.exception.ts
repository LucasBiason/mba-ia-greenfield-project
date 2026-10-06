import { DomainException } from './domain.exception';

/**
 * Raised when an authenticated user attempts to upload to or mutate a channel they do not own.
 * Enforces ownership authorization and prevents IDOR (OWASP A01).
 */
export class ChannelOwnershipException extends DomainException {
  constructor() {
    super(
      'CHANNEL_OWNERSHIP_ERROR',
      403,
      'Authenticated user is not the owner of this channel',
    );
  }
}
