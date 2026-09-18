import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ShortlistTopDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;
}
