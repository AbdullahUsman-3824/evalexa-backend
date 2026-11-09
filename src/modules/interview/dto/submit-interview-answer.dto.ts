import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecordingType } from '@prisma/client';

export class InterviewRecordingDto {
  @IsEnum(RecordingType)
  type!: RecordingType;

  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  checksum?: string;
}

export class SubmitInterviewAnswerDto {
  @IsOptional()
  @IsString()
  answerText?: string;

  @IsInt()
  @Min(0)
  durationSeconds!: number;

  @ValidateNested({ each: true })
  @Type(() => InterviewRecordingDto)
  @IsArray()
  recordings!: InterviewRecordingDto[];
}
