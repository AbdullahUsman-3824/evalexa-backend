import { IsBoolean, IsInt, IsOptional, Min, Max } from 'class-validator';

export class JobAiConfigDto {
  @IsOptional()
  @IsBoolean()
  enableRanking?: boolean = true;

  @IsOptional()
  @IsBoolean()
  enableAutoShortlisting?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(1)
  shortlistLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minimumMatchScore?: number;

  @IsOptional()
  @IsBoolean()
  enableAiInterview?: boolean = false;

  @IsOptional()
  @IsInt()
  @Min(1)
  interviewLimit?: number;
}