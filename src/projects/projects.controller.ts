import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { UpdateStageDto } from './dto/update-stage.dto.js';
import { QueryProjectsDto } from './dto/query-projects.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: QueryProjectsDto) {
    return this.projects.list(query);
  }

  @Get(':code')
  detail(@Param('code') code: string) {
    return this.projects.detail(code);
  }

  @Patch(':code')
  @Roles('admin', 'pm')
  update(
    @Param('code') code: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateProject(code, dto, user);
  }

  @Patch(':code/stages/:stageNo')
  @Roles('admin', 'pm')
  updateStage(
    @Param('code') code: string,
    @Param('stageNo', ParseIntPipe) stageNo: number,
    @Body() dto: UpdateStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateStage(code, stageNo, dto.is_completed, user);
  }
}
