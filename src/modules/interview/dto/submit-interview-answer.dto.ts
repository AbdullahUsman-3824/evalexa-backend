import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class SubmitInterviewAnswerDto {
  @IsInt()
  @Min(0)
  durationSeconds!: number;

  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
