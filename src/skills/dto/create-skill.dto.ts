import { IsString, MaxLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(100)
  category!: string;
}