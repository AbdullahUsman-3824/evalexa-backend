import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JobStatus, JobType, WorkModel } from '@prisma/client';

export enum JobSortBy {
  NEWEST = 'newest',
  DEADLINE = 'deadline',
}

export class FindJobsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @IsOptional()
  @IsEnum(WorkModel)
  workModel?: WorkModel;

  @IsOptional()
  @IsEnum(JobSortBy)
  @Type(() => String)
  sortBy?: JobSortBy;
}
