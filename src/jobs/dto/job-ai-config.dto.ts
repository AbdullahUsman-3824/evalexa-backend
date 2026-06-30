import { IsBoolean, IsInt, Min } from 'class-validator';

export class JobAiConfigDto {
  @IsBoolean()
  enableAutoShortlist!: boolean;

  @IsInt()
  @Min(1)
  resumeSelectionCount!: number;

  @IsBoolean()
  enableAiInterview!: boolean;

  @IsInt()
  @Min(1)
  interviewSelectionCount!: number;
}