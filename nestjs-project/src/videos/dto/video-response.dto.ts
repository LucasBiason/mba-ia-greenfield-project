import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VideoStatus } from '../enums/video-status.enum';
import { VideoVisibility } from '../enums/video-visibility.enum';
import { Video } from '../entities/video.entity';

export class VideoChannelDto {
  @ApiProperty({ description: 'Channel public UUID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Channel name' })
  name: string;

  @ApiProperty({ description: 'Channel unique nickname/handle' })
  nickname: string;
}

export class VideoResponseDto {
  @ApiProperty({
    description: 'Unique 12-character public identifier',
    example: 'HP8JZ2O3bROa',
  })
  publicId: string;

  @ApiPropertyOptional({
    description: 'Video title',
    nullable: true,
    example: 'StreamTube Demo',
  })
  title: string | null;

  @ApiPropertyOptional({
    description: 'Video description',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Video processing status',
    enum: VideoStatus,
    example: VideoStatus.READY,
  })
  status: VideoStatus;

  @ApiProperty({
    description: 'Video visibility',
    enum: VideoVisibility,
    example: VideoVisibility.PUBLIC,
  })
  visibility: VideoVisibility;

  @ApiProperty({
    description: 'Total file size in bytes (up to 10GB)',
    example: '104857600',
  })
  fileSize: string;

  @ApiProperty({
    description: 'Original uploaded filename',
    example: 'demo.mp4',
  })
  originalFilename: string;

  @ApiPropertyOptional({
    description: 'Storage key for thumbnail image',
    nullable: true,
  })
  thumbnailKey: string | null;

  @ApiPropertyOptional({
    description: 'Video duration in seconds',
    nullable: true,
    example: 120,
  })
  durationInSeconds: number | null;

  @ApiProperty({
    description: 'Channel that owns this video',
    type: () => VideoChannelDto,
  })
  channel: VideoChannelDto;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  static fromEntity(video: Video): VideoResponseDto {
    const dto = new VideoResponseDto();
    dto.publicId = video.public_id;
    dto.title = video.title;
    dto.description = video.description;
    dto.status = video.status;
    dto.visibility = video.visibility;
    dto.fileSize = video.file_size;
    dto.originalFilename = video.original_filename;
    dto.thumbnailKey = video.thumbnail_key;
    dto.durationInSeconds = video.duration_in_seconds;
    dto.createdAt = video.created_at;
    dto.updatedAt = video.updated_at;

    if (video.channel) {
      dto.channel = {
        id: video.channel.id,
        name: video.channel.name,
        nickname: video.channel.nickname,
      };
    } else {
      dto.channel = {
        id: video.channel_id,
        name: '',
        nickname: '',
      };
    }

    return dto;
  }
}
