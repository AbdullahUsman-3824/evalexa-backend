import { Type } from 'class-transformer';
import {
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
import {
  EducationLevel,
  ExperienceLevel,
  JobStatus,
  JobType,
  SalaryPeriod,
  WorkModel,
} from '@prisma/client';
import { JobAiConfigDto } from './job-ai-config.dto';
import { JobSkillInputDto } from './job-skill-input.dto';

export class UpdateSalaryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsEnum(SalaryPeriod)
  period?: SalaryPeriod;
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150) // Changed from 255 to 150 to match schema
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @IsOptional()
  @IsEnum(WorkModel)
  workModel?: WorkModel;

  @IsOptional()
  @IsString()
  description?: string;

  // responsibilities removed - no longer in schema

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  applicationDeadline?: Date;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSalaryDto)
  salary?: UpdateSalaryDto;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalOpenings?: number; // New field

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobSkillInputDto)
  skills?: JobSkillInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => JobAiConfigDto)
  aiConfig?: JobAiConfigDto;
}
