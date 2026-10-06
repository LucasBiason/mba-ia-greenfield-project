/**
 * Video visibility levels.
 *
 * Levels:
 *  - PUBLIC: Discoverable by anyone, streams without auth restrictions.
 *  - UNLISTED: Accessible only via direct link / public ID (unguessable nanoid).
 *  - PRIVATE: Accessible exclusively by the channel owner.
 */
export enum VideoVisibility {
  PUBLIC = 'PUBLIC',
  UNLISTED = 'UNLISTED',
  PRIVATE = 'PRIVATE',
}
