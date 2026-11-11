import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  current_password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  new_password!: string;
}
