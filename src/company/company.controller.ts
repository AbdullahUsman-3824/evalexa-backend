import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyService } from './company.service';

@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post(':userId')
  createCompany(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CreateCompanyDto,
  ): void {
    this.companyService.createCompany(userId, dto);
  }
}
