import { SkillImportance } from '@prisma/client';
import { IsEnum, IsInt, IsUUID, Min } from 'class-validator';

export class JobSkillInputDto {
  @IsUUID()
  skillId!: string;

  @IsEnum(SkillImportance)
  importance!: SkillImportance;

  @IsInt()
  @Min(1)
  weight!: number;
}
