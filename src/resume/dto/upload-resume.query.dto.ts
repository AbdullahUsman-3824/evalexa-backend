import { IsOptional, IsUUID } from 'class-validator';

export class UploadResumeQueryDto {
  @IsOptional()
  @IsUUID()
  candidateId?: string;
}
