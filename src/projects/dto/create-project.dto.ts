import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class ClientInputDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsString()
  @Length(1, 255)
  address!: string;

  @IsString()
  @Length(1, 120)
  contact_name!: string;

  @IsString()
  @Length(1, 120)
  contact_role!: string;

  @IsString()
  @Length(1, 30)
  phone!: string;
}

export class CreateProjectDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsDateString()
  start_date?: string | null;

  @IsOptional()
  @IsDateString()
  due_date?: string | null;

  /** Pakai klien yang sudah ada. */
  @IsOptional()
  @IsUUID()
  client_id?: string;

  /** Atau buat klien baru sekaligus. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientInputDto)
  client?: ClientInputDto;
}
