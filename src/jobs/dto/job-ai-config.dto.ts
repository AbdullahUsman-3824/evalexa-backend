import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class JobAiConfigDto {
  @IsInt()
  @Min(0)
  @Max(100)
  minMatchScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  autoShortlistThreshold!: number;

  @IsBoolean()
  enableAutoShortlist!: boolean;

  @IsBoolean()
  enableAiInterview!: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  aiInterviewThreshold!: number;
}