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
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
   * Public discovery endpoint via publicId.
   */
  @Get(':publicId')
  async getByPublicId(@Param('publicId') publicId: string) {
    return this.videosService.findByPublicId(publicId);
  }

  /**
   * Streams video content with RFC 7233 Range support (HTTP 206 Partial Content).
   */
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
