import { Controller, Get, Query } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { QueryClientsDto } from './dto/query-clients.dto.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query() query: QueryClientsDto) {
    return this.clients.list(query);
  }
}
