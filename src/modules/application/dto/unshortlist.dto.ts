import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UnshortlistDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
