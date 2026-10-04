import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApplicationStatus } from '@prisma/client';

function toStatusArray(value: unknown): ApplicationStatus[] | undefined {
  if (value == null || value === '') return undefined;

  let raw: string[];

  if (Array.isArray(value)) {
    raw = value
      .filter(
        (v): v is string | number =>
          typeof v === 'string' || typeof v === 'number',
      )
      .map(String);
  } else if (typeof value === 'string' || typeof value === 'number') {
    raw = [String(value)];
  } else {
    return undefined; // object / unexpected → ignore
  }

  const statuses = raw
    .flatMap((s) => s.split(','))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as ApplicationStatus[];

  return statuses.length > 0 ? statuses : undefined;
}

export class FindJobApplicationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  /** ?status=SHORTLISTED or ?status=SHORTLISTED,REJECTED or ?status=SHORTLISTED&status=REJECTED */
  @IsOptional()
  @Transform(({ value }) => toStatusArray(value))
  @IsEnum(ApplicationStatus, { each: true })
  status?: ApplicationStatus[];

  @IsOptional()
  @IsIn(['rankPosition', 'matchScore', 'appliedAt'])
  sortBy?: 'rankPosition' | 'matchScore' | 'appliedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
