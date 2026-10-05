import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VideoVisibility } from '../enums/video-visibility.enum';

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'title cannot exceed 150 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(VideoVisibility, {
    message: 'visibility must be PUBLIC, UNLISTED, or PRIVATE',
  })
  visibility?: VideoVisibility;
}
