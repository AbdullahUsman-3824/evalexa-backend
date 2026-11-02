import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ValidateTokenQueryDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class RequestOtpDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'otp must be a 6-digit code',
  })
  otp!: string;
}
