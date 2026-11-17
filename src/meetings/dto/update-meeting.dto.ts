import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { MeetingMode } from '@prisma/client';

export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agenda?: string;

  @IsOptional()
  @IsEnum(MeetingMode)
  mode?: MeetingMode;

  @IsOptional()
  @IsISO8601()
  start_at?: string;

  @IsOptional()
  @IsISO8601()
  end_at?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  meeting_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  project_code?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  participant_ids?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
