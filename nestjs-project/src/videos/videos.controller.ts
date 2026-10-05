import {
  All,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { InitUploadDto } from './dto/init-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadResponseDto } from './dto/upload-response.dto';
import { VideosService } from './videos.service';

/**
 * VideosController -- manages video upload initialization, tus resumable chunk stream,
 * public discovery, HTTP 206 range streaming, download, and metadata mutation.
 */
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  /**
   * Initializes a video upload / draft.
   */
  @Public()
  @Post('upload/init')
  @HttpCode(201)
  async initUpload(
    @Body() dto: InitUploadDto,
    @CurrentUser() currentUser?: JwtPayload,
    @Headers('x-user-id') userIdHeader?: string,
  ): Promise<UploadResponseDto> {
    const effectiveUserId =
      currentUser?.sub ||
      userIdHeader ||
      '00000000-0000-0000-0000-000000000000';
    return this.videosService.initUpload(dto, effectiveUserId);
  }

  /**
   * Completes an upload and triggers FFmpeg worker processing.
   */
  @Public()
  @Post(':publicId/complete')
  @HttpCode(200)
  async completeUpload(
    @Param('publicId') publicId: string,
    @Body() body: { storageKey?: string; fileSize?: number },
  ) {
    const video = await this.videosService.findByPublicId(publicId);
    return this.videosService.markUploadCompleted(
      video.id,
      body.storageKey || video.video_key,
      body.fileSize || Number(video.file_size) || 0,
    );
  }

  /**
   * Lists videos optionally filtered by channelId.
   */
  @Public()
  @Get()
  async findAll(@Query('channelId') channelId?: string) {
    return this.videosService.findAll(channelId);
  }

  /**
   * Public discovery endpoint via publicId.
   */
  @Public()
  @Get(':publicId')
  async getByPublicId(@Param('publicId') publicId: string) {
    return this.videosService.findByPublicId(publicId);
  }

  /**
   * Streams video content with RFC 7233 Range support (HTTP 206 Partial Content).
   */
  @Public()
  @Get(':publicId/stream')
  async streamVideo(
    @Param('publicId') publicId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.videosService.streamVideo(publicId, rangeHeader);
    res.status(result.statusCode);
    res.set(result.headers);
    result.stream.pipe(res);
  }

  /**
   * Generates a signed download URL and redirects the client to download the original video.
   */
  @Public()
  @Get(':publicId/download')
  async downloadVideo(
    @Param('publicId') publicId: string,
    @Res() res: Response,
  ): Promise<void> {
    const downloadUrl = await this.videosService.downloadVideo(publicId);
    res.redirect(downloadUrl);
  }

  /**
   * Updates video metadata and visibility.
   */
  @Patch(':publicId')
  async updateMetadata(
    @Param('publicId') publicId: string,
    @Body() dto: UpdateVideoDto,
    @CurrentUser() currentUser?: JwtPayload,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const effectiveUserId =
      currentUser?.sub ||
      userIdHeader ||
      '00000000-0000-0000-0000-000000000000';
    return this.videosService.updateMetadata(publicId, dto, effectiveUserId);
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
    res.status(503).json({
      statusCode: 503,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Tus upload server is not initialized',
    });
  }
}
