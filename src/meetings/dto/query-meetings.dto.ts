import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class QueryMeetingsDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsIn(['all', 'mine'])
  scope?: 'all' | 'mine';

  @IsOptional()
  @IsString()
  project_code?: string;
}
