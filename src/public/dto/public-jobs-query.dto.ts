import { ExperienceLevel, JobType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PublicPaginationDto } from './public-pagination.dto';

export enum PublicJobSortBy {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  DEADLINE = 'deadline',
  SALARY_HIGH = 'salary-high',
  SALARY_LOW = 'salary-low',
}

export class PublicJobsQueryDto extends PublicPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsEnum(JobType)
  employmentType?: JobType;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  skills?: string;

  @IsOptional()
  @IsEnum(PublicJobSortBy)
  sort?: PublicJobSortBy;
}
