import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { ClientInputDto } from './create-project.dto.js';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8)
  current_stage?: number;

  @IsOptional()
  @IsDateString()
  start_date?: string | null;

  @IsOptional()
  @IsDateString()
  due_date?: string | null;

  /** Data klien dipakai bersama oleh semua proyek klien tersebut. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientInputDto)
  client?: ClientInputDto;
}
