import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  getDashboard() {
    return this.dashboard.getDashboard();
  }
}
