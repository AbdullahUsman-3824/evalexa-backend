import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExperienceLevel, JobStatus, JobType, WorkModel } from '@prisma/client';
import { JobAiConfigDto } from './job-ai-config.dto';
import { JobSkillInputDto } from './job-skill-input.dto';

export class CreateJobDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(JobType)
  jobType!: JobType;

  @IsEnum(ExperienceLevel)
  experienceLevel!: ExperienceLevel;

  @IsInt()
  @Min(0)
  salaryMin!: number;

  @IsInt()
  @Min(0)
  salaryMax!: number;

  @IsString()
  @MaxLength(255)
  location!: string;

  @IsEnum(WorkModel)
  workModel!: WorkModel;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @Type(() => Date)
  @IsDate()
  applicationDeadline!: Date;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JobSkillInputDto)
  skills!: JobSkillInputDto[];

  @ValidateNested()
  @Type(() => JobAiConfigDto)
  aiConfig!: JobAiConfigDto;
}
