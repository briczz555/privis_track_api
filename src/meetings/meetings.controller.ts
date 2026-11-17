import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { QueryMeetingsDto } from './dto/query-meetings.dto.js';
import { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import { MeetingsService } from './meetings.service.js';

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
}
