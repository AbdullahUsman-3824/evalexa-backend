import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { SUPPORTED_MIME_TYPES } from '../../../common/fastapi/contracts';

export class SubmitInterviewAnswerDto {
  @IsInt()
  @Min(0)
  durationSeconds!: number;

  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsString()
  @IsIn(SUPPORTED_MIME_TYPES)
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
