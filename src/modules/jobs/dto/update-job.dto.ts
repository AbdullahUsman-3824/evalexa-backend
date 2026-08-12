import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

import { PartialType } from '@nestjs/mapped-types';
import { CreateJobDto, SalaryDto } from './create-job.dto';

export class UpdateSalaryDto extends PartialType(SalaryDto) {}

export class UpdateJobDto extends PartialType(CreateJobDto) {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSalaryDto)
  salary?: UpdateSalaryDto;
}
