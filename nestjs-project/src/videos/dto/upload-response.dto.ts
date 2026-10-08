import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../enums/video-status.enum';

/**
 * Response payload returned when an upload draft is created / initiated.
 */
export class UploadResponseDto {
  @ApiProperty({
    description: 'Internal video UUID used by the tus upload session',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Unique 12-character public identifier',
    example: 'HP8JZ2O3bROa',
  })
  publicId: string;

  @ApiProperty({
    description: 'Initial video title',
    example: 'StreamTube Demo',
  })
  title: string;

  @ApiProperty({
    description: 'Current upload status',
    enum: VideoStatus,
    example: VideoStatus.UPLOADING,
  })
  status: VideoStatus;

  @ApiProperty({
    description: 'Tus resumable upload endpoint for streaming chunks',
    example: '/videos/upload/d17b3c8f-5192-49ee-9150-13eeadcfef02',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'Pre-allocated storage key in the bucket',
    example: 'videos/HP8JZ2O3bROa/demo.mp4',
  })
  storageKey: string;
}
