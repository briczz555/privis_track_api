import { IsBoolean } from 'class-validator';

export class UpdateStageDto {
  @IsBoolean()
  is_completed!: boolean;
}
