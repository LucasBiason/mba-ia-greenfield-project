import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Maximum video file size in bytes: 10GB = 10 * 1024 * 1024 * 1024.
 */
export const MAX_VIDEO_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * Data Transfer Object for initiating a video upload / draft.
 */
export class InitUploadDto {
  @ApiPropertyOptional({
    description:
      'Channel UUID that will own the video (optional, defaults to authenticated user channel)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'channelId must be a valid UUID' })
  channelId?: string;

  @ApiPropertyOptional({
    description: 'Initial video title (optional at draft stage)',
    maxLength: 150,
    example: 'Introduction to Full Cycle',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'title cannot exceed 150 characters' })
  title?: string;

  @ApiProperty({
    description: 'Original name of the video file',
    example: 'fullcycle-lesson1.mp4',
  })
  @IsString()
  @IsNotEmpty({ message: 'fileName is required' })
  fileName!: string;

  @ApiProperty({
    description: 'File size in bytes (max 10GB = 10737418240 bytes)',
    minimum: 1,
    maximum: MAX_VIDEO_FILE_SIZE_BYTES,
    example: 104857600,
  })
  @IsNumber({}, { message: 'fileSize must be a number in bytes' })
  @Min(1, { message: 'fileSize must be greater than 0' })
  @Max(MAX_VIDEO_FILE_SIZE_BYTES, {
    message: 'fileSize cannot exceed 10GB (10737418240 bytes)',
  })
  fileSize!: number;

  @ApiProperty({
    description:
      'MIME type of the video (video/mp4, video/webm, video/quicktime)',
    example: 'video/mp4',
  })
  @IsString()
  @IsNotEmpty({ message: 'mimeType is required' })
  mimeType!: string;

  @ApiPropertyOptional({
    description:
      'Client-generated token to avoid duplicate drafts on network retries',
    example: 'retry-uuid-12345',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
