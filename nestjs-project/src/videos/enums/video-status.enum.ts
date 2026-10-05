/**
 * Video lifecycle statuses.
 *
 * Conforms to F07 (Upload & Draft), F08 (Async Video Processing), and F10 (Streaming).
 *
 * State transitions:
 *  - DRAFT: Metadata or upload initiated, not yet receiving bytes.
 *  - UPLOADING: Chunked transfer in progress (resumable via tus protocol).
 *  - PROCESSING: Upload completed; FFmpeg worker queued/extracting metadata and thumbnail.
 *  - READY: Processing finished; ready for playback and streaming (HTTP 206).
 *  - ERROR: Upload aborted, corrupted, or FFmpeg processing failed after retries.
 */
export enum VideoStatus {
  DRAFT = 'DRAFT',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  ERROR = 'ERROR',
}
