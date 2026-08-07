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
import {
  EducationLevel,
  ExperienceLevel,
  JobStatus,
  JobType,
  WorkModel,
  SalaryPeriod,
} from '@prisma/client';
import { JobAiConfigDto } from './job-ai-config.dto';
import { JobSkillInputDto } from './job-skill-input.dto';

export class SalaryDto {
  @IsInt()
  @Min(0)
  min!: number;

  @IsInt()
  @Min(0)
  max!: number;

  @IsString()
  @MaxLength(10)
  currency: string = 'PKR';

  @IsEnum(SalaryPeriod)
  period!: SalaryPeriod;
}

export class CreateJobDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)  // Changed from 255 to 150 to match schema
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsEnum(JobType)
  jobType!: JobType;

  @IsEnum(WorkModel)
  workModel!: WorkModel;

  @IsString()
  description!: string;

  // responsibilities removed - no longer in schema

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  applicationDeadline?: Date;

  @IsEnum(ExperienceLevel)
  experienceLevel!: ExperienceLevel;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel = EducationLevel.ANY;

  @ValidateNested()
  @Type(() => SalaryDto)
  salary!: SalaryDto;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus = JobStatus.DRAFT;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalOpenings?: number = 1;  // New field

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JobSkillInputDto)
  skills!: JobSkillInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => JobAiConfigDto)
  aiConfig?: JobAiConfigDto;
}