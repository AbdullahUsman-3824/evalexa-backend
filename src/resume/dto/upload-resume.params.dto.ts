import { IsUUID } from 'class-validator';

export class UploadResumeParamsDto {
  @IsUUID()
  candidateId!: string;
}
