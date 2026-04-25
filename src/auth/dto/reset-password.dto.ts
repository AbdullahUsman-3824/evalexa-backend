import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'otp must be a 6-digit code',
  })
  otp!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
