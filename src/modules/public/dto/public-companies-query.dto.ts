import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PublicPaginationDto } from './public-pagination.dto';

export enum PublicCompanySortBy {
  NEWEST = 'newest',
  NAME_ASC = 'name-asc',
  NAME_DESC = 'name-desc',
  JOBS_HIGH = 'jobs-high',
  JOBS_LOW = 'jobs-low',
}

export class PublicCompaniesQueryDto extends PublicPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsEnum(PublicCompanySortBy)
  sort?: PublicCompanySortBy;
}
