import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { QueryMeetingsDto } from './dto/query-meetings.dto.js';
import { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import { MeetingsService } from './meetings.service.js';
import { DOCX_MIME_TYPE } from './mom/mom-fields.js';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(
    @Query() query: QueryMeetingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.meetings.list(query, user);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.meetings.detail(id);
  }

  @Post()
  create(
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.meetings.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.meetings.update(id, dto, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.cancel(id, user);
  }

  @Post(':id/mom')
  generateMom(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.meetings.generateMom(id, user);
  }

  @Get(':id/mom')
  async downloadMom(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { mom, object } = await this.meetings.downloadMom(id);

    response.setHeader('Content-Type', object.contentType ?? DOCX_MIME_TYPE);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(mom.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    if (object.contentLength !== undefined) {
      response.setHeader('Content-Length', object.contentLength);
    }

    response.status(HttpStatus.OK);
    object.body.pipe(response);
  }
}
