import { SkillImportance } from '@prisma/client';
import { IsEnum, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class JobSkillInputDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsEnum(SkillImportance)
  importance!: SkillImportance;

  @IsInt()
  @Min(1)
  weight!: number;
}
