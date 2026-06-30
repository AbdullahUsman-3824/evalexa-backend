import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CompanySize, CompanyType } from '@prisma/client';

export class CreateCompanyDto {
  // required
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(100)
  industry!: string;

  @IsString()
  @MaxLength(255)
  location!: string;

  // optional
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CompanySize)
  size?: CompanySize;

  @IsOptional()
  @IsInt()
  @Max(new Date().getFullYear())
  foundedYear?: number;

  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsOptional()
  @IsUrl()
  banner?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  verificationDocuments?: string[];
}