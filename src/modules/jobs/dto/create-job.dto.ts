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
  currency?: string = 'PKR';

  @IsOptional()
  @IsEnum(SalaryPeriod)
  period?: SalaryPeriod;
}

export class CreateJobDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
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
  totalOpenings?: number = 1;

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
