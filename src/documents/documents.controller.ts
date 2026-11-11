import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import {
  DocumentsService,
  type UploadedDocumentFile,
} from './documents.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('projects/:projectCode/stages/:stageNo/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 26 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('projectCode') projectCode: string,
    @Param('stageNo', ParseIntPipe) stageNo: number,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.upload({
      projectCode,
      stageNo,
      file,
      requestedName: dto.name,
      actor: user,
    });
  }

  @Get('projects/:projectCode/stages/:stageNo/documents')
  list(
    @Param('projectCode') projectCode: string,
    @Param('stageNo', ParseIntPipe) stageNo: number,
  ) {
    return this.documents.list(projectCode, stageNo);
  }

  @Get('documents/:documentId/download')
  async download(
    @Param('documentId') documentId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const { document, object } = await this.documents.download(
      documentId,
      range,
    );

    response.setHeader(
      'Content-Type',
      object.contentType ?? document.mimeType,
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    );
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, no-store');

    if (object.contentLength !== undefined) {
      response.setHeader('Content-Length', object.contentLength);
    }
    if (object.contentRange) {
      response.setHeader('Content-Range', object.contentRange);
      response.status(HttpStatus.PARTIAL_CONTENT);
    } else {
      response.status(HttpStatus.OK);
    }

    object.body.pipe(response);
  }

  @Delete('documents/:documentId')
  @Roles('admin', 'pm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.documents.remove(documentId, user);
  }
}
