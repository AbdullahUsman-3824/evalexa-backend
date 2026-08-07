import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FindSkillsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}