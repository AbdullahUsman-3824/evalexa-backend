import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsString()
  @MaxLength(100)
  industry: string;

  @IsString()
  @MaxLength(50)
  companySize: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsString()
  @MaxLength(255)
  location: string;

  @IsOptional()
  @IsString()
  description?: string;
}
