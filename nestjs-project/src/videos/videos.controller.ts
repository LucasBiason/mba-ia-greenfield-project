import {
  All,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import * as path from 'path';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { SkipThrottle } from '@nestjs/throttler';
import { ChannelOwnershipException } from '../common/exceptions/channel-ownership.exception';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitUploadDto } from './dto/init-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadResponseDto } from './dto/upload-response.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideosService } from './videos.service';

/**
 * VideosController -- manages video upload initialization, tus resumable chunk streaming,
 * public discovery, HTTP 206 range streaming, download, and metadata mutation.
 */
@ApiTags('videos')
@SkipThrottle()
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  /**
   * Initializes a video upload / draft for an authenticated channel owner.
   */
  @Post('upload/init')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initialize a video upload draft',
    description:
      'Creates a new video draft in UPLOADING status and returns the tus upload endpoint.',
  })
  @ApiResponse({
    status: 201,
    description: 'Video upload draft initialized successfully',
    type: UploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed on request body parameters',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Authenticated user is not the owner of the channel (anti-IDOR)',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Channel not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 413,
    description: 'File size exceeds maximum allowed limit (10GB)',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported video MIME type format',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async initUpload(
    @Body() dto: InitUploadDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UploadResponseDto> {
    return this.videosService.initUpload(dto, currentUser.sub);
  }

  /**
   * Completes an upload and triggers FFmpeg worker processing.
   */
  @Post(':publicId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete video upload',
    description:
      'Notifies upload completion, moves status to PROCESSING and enqueues FFmpeg processing job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video transitioned to PROCESSING and enqueued',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed or storageKey does not belong to this video',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not the channel owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async completeUpload(
    @Param('publicId') publicId: string,
    @Body() dto: CompleteUploadDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<VideoResponseDto> {
    const video = await this.videosService.findByPublicId(
      publicId,
      currentUser.sub,
    );
    if (video.channel && video.channel.user_id !== currentUser.sub) {
      throw new ChannelOwnershipException();
    }
    if (
      dto.storageKey &&
      !dto.storageKey.startsWith(`videos/${video.public_id}/`)
    ) {
      throw new BadRequestException(
        'storageKey must belong to this video (videos/<publicId>/...)',
      );
    }
    const updated = await this.videosService.markUploadCompleted(
      video.id,
      dto.storageKey || video.video_key,
      dto.fileSize || Number(video.file_size) || 0,
    );
    return VideoResponseDto.fromEntity(updated);
  }

  /**
   * Lists public videos, optionally filtered by channelId.
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: 'List videos',
    description:
      'Returns a catalog of videos, filtered by channel when requested.',
  })
  @ApiQuery({ name: 'channelId', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of video resources',
    type: [VideoResponseDto],
  })
  async findAll(
    @Query('channelId') channelId?: string,
    @CurrentUser() currentUser?: JwtPayload,
  ): Promise<VideoResponseDto[]> {
    const videos = await this.videosService.findAll(
      channelId,
      currentUser?.sub,
    );
    return videos.map((video) => VideoResponseDto.fromEntity(video));
  }

  /**
   * Public discovery endpoint via publicId.
   */
  @Public()
  @Get(':publicId')
  @ApiOperation({
    summary: 'Get video details by public ID',
    description: 'Returns video details by 12-char nanoid identifier.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video metadata details',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Private video not accessible by current user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getByPublicId(
    @Param('publicId') publicId: string,
    @CurrentUser() currentUser?: JwtPayload,
  ): Promise<VideoResponseDto> {
    const video = await this.videosService.findByPublicId(
      publicId,
      currentUser?.sub,
    );
    return VideoResponseDto.fromEntity(video);
  }

  /**
   * Streams video content with RFC 7233 Range support (HTTP 206 Partial Content).
   */
  @Public()
  @Get(':publicId/stream')
  @ApiOperation({
    summary: 'Stream video content',
    description:
      'Streams video content with support for RFC 7233 HTTP 206 Partial Content range requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full video content stream',
  })
  @ApiResponse({
    status: 206,
    description: 'Partial range content stream',
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not yet in READY status',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async streamVideo(
    @Param('publicId') publicId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
    @CurrentUser() currentUser?: JwtPayload,
  ): Promise<void> {
    const result = await this.videosService.streamVideo(
      publicId,
      rangeHeader,
      currentUser?.sub,
    );
    res.status(result.statusCode);
    res.set(result.headers);
    result.stream.pipe(res);
  }

  /**
   * Retrieves thumbnail JPEG binary stream for video.
   */
  @Public()
  @Get(':publicId/thumbnail')
  @ApiOperation({
    summary: 'Get video thumbnail image',
    description: 'Streams JPEG thumbnail image generated for the video.',
  })
  @ApiResponse({
    status: 200,
    description: 'Thumbnail image binary stream',
  })
  @ApiResponse({
    status: 404,
    description: 'Video or thumbnail not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getThumbnail(
    @Param('publicId') publicId: string,
    @Res() res: Response,
    @CurrentUser() currentUser?: JwtPayload,
  ): Promise<void> {
    const stream = await this.videosService.getThumbnailStream(
      publicId,
      currentUser?.sub,
    );
    res.status(HttpStatus.OK);
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    });
    stream.pipe(res);
  }

  /**
   * Downloads original video content preserving filename attachment (RFC 6266).
   */
  @Public()
  @Get(':publicId/download')
  @ApiOperation({
    summary: 'Download original video file',
    description:
      'Streams video binary with Content-Disposition attachment header for direct download.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video download binary stream',
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async downloadVideo(
    @Param('publicId') publicId: string,
    @Res() res: Response,
    @CurrentUser() currentUser?: JwtPayload,
  ): Promise<void> {
    const video = await this.videosService.findByPublicId(
      publicId,
      currentUser?.sub,
    );
    const result = await this.videosService.streamVideo(
      publicId,
      undefined,
      currentUser?.sub,
    );
    const ext = path.extname(video.original_filename || '').toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.status(HttpStatus.OK);
    res.set({
      ...result.headers,
      'Content-Disposition': `attachment; filename="${video.original_filename}"`,
      'Content-Type': contentType,
    });
    result.stream.pipe(res);
  }

  /**
   * Updates video metadata and visibility.
   */
  @Patch(':publicId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update video metadata',
    description:
      'Updates editable video metadata (title, description, visibility) for the channel owner.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video metadata updated successfully',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not the channel owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async updateMetadata(
    @Param('publicId') publicId: string,
    @Body() dto: UpdateVideoDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<VideoResponseDto> {
    const video = await this.videosService.updateMetadata(
      publicId,
      dto,
      currentUser.sub,
    );
    return VideoResponseDto.fromEntity(video);
  }

  /**
   * Catch-all handler delegating tus protocol requests to the TusServer.
   */
  @Public()
  @ApiExcludeEndpoint()
  @All(['upload', 'upload/:uploadId'])
  async handleTusUpload(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const tus = this.videosService.getTusServer();
    if (tus) {
      return tus.handle(req, res);
    }
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Tus upload server is not initialized',
    });
  }
}
