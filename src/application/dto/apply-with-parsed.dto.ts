import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ApplyWithParsedPersonalDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

class ApplyWithParsedEducationDto {
  @IsString()
  school!: string;

  @IsOptional()
  @IsString()
  fieldOfStudy?: string;

  @IsOptional()
  @IsString()
  degree?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

class ApplyWithParsedExperienceDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class ApplyWithParsedDto {
  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsUUID()
  resumeId?: string;

  @IsOptional()
  @IsString()
  resumeUrl?: string;

  @ValidateNested()
  @Type(() => ApplyWithParsedPersonalDto)
  personal!: ApplyWithParsedPersonalDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyWithParsedEducationDto)
  education!: ApplyWithParsedEducationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyWithParsedExperienceDto)
  experience!: ApplyWithParsedExperienceDto[];

  @IsUUID()
  jobId!: string;

  @IsUUID()
  companyId!: string;
}
