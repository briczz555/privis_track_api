import { Controller, Get, Query } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { QueryActivitiesDto } from './dto/query-activities.dto.js';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(@Query() query: QueryActivitiesDto) {
    return this.activities.list(query);
  }
}
