import { Controller, Get, Param, Query } from '@nestjs/common';
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
}
