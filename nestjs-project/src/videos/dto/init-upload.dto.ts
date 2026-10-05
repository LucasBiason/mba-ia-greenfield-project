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
 * Maximum video file size in bytes: 10GB = 10 * 1024 * 1024 * 1024 (REQ-SEC-07 / NFR02).
 */
export const MAX_VIDEO_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * Data Transfer Object for initiating a video upload / draft (F07 / FR-001).
 */
export class InitUploadDto {
  @IsUUID('4', { message: 'channelId must be a valid UUID' })
  @IsNotEmpty()
  channelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'title cannot exceed 150 characters' })
  title?: string;

  @IsString()
  @IsNotEmpty({ message: 'fileName is required' })
  fileName!: string;

  @IsNumber({}, { message: 'fileSize must be a number in bytes' })
  @Min(1, { message: 'fileSize must be greater than 0' })
  @Max(MAX_VIDEO_FILE_SIZE_BYTES, {
    message: 'fileSize cannot exceed 10GB (10737418240 bytes)',
  })
  fileSize!: number;

  @IsString()
  @IsNotEmpty({ message: 'mimeType is required' })
  mimeType!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
