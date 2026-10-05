/**
 * Video visibility levels.
 *
 * Conforms to F10 (Streaming), F12 (Video Editing & Visibility), and NFR01 (Access Control).
 *
 * Levels:
 *  - PUBLIC: Discoverable by anyone, streams without auth restrictions.
 *  - UNLISTED: Accessible only via direct link / public ID (unguessable nanoid - ADR-0003).
 *  - PRIVATE: Accessible exclusively by the channel owner.
 */
export enum VideoVisibility {
  PUBLIC = 'PUBLIC',
  UNLISTED = 'UNLISTED',
  PRIVATE = 'PRIVATE',
}
