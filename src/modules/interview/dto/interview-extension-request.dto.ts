import { Transform, Type } from 'class-transformer';
import { ExtensionRequestStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateInterviewExtensionRequestDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

export class InterviewExtensionRequestQueryDto {
  @IsOptional()
  @IsEnum(ExtensionRequestStatus)
  status?: ExtensionRequestStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ReviewInterviewExtensionRequestDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  decisionNote?: string;
}
