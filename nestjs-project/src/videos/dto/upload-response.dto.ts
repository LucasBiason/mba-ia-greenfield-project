import { VideoStatus } from '../enums/video-status.enum';

/**
 * Response payload returned when an upload draft is created / initiated.
 */
export interface UploadResponseDto {
  id: string;
  publicId: string;
  title: string;
  status: VideoStatus;
  uploadUrl: string;
  storageKey: string;
}
