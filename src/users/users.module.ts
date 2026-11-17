import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { UserOptionsController } from './user-options.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuditModule],
  controllers: [UsersController, UserOptionsController],
  providers: [UsersService],
})
export class UsersModule {}
