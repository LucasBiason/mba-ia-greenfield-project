import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  Matches,
} from 'class-validator';

/**
 * CompleteUploadDto validates parameters provided when finalizing a video upload.
 * It prevents arbitrary storage key injection and enforces bounds on fileSize.
 */
export class CompleteUploadDto {
  @ApiPropertyOptional({
    description:
      'Storage key in the videos bucket (must strictly match videos/<publicId>/<filename>)',
    example: 'videos/abc123xyz456/sample.mp4',
  })
  @IsOptional()
  @IsString()
  @Matches(/^videos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/, {
    message: 'storageKey must match the format videos/<publicId>/<filename>',
  })
  storageKey?: string;

  @ApiPropertyOptional({
    description: 'File size in bytes (max 10GB = 10,737,418,240 bytes)',
    example: 10485760,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10 * 1024 * 1024 * 1024)
  fileSize?: number;
}
