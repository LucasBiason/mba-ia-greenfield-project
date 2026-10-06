import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VideoVisibility } from '../enums/video-visibility.enum';

export class UpdateVideoDto {
  @ApiPropertyOptional({
    description: 'Updated video title (max 150 characters)',
    maxLength: 150,
    example: 'StreamTube Demo Final',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'title cannot exceed 150 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated video description',
    example: 'A comprehensive demo of the upload feature.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Video visibility (PUBLIC, UNLISTED, PRIVATE)',
    enum: VideoVisibility,
    example: VideoVisibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(VideoVisibility, {
    message: 'visibility must be PUBLIC, UNLISTED, or PRIVATE',
  })
  visibility?: VideoVisibility;
}
