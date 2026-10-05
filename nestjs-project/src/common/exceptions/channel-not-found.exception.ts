import { DomainException } from './domain.exception';

/**
 * Raised when a targeted channel is not found.
 */
export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Channel not found');
  }
}
