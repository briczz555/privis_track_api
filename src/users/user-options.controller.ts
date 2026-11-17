import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service.js';

/// Endpoint ringan untuk kebutuhan picker (peserta meeting, dsb). Semua user
/// terautentikasi boleh mengakses; hanya data user aktif yang dikembalikan.
@Controller('users')
export class UserOptionsController {
  constructor(private readonly users: UsersService) {}

  @Get('options')
  options() {
    return this.users.options();
  }
}
