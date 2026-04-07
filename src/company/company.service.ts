import { Injectable } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class CompanyService {
  createCompany(userId: number, dto: CreateCompanyDto): void {
    void userId;
    void dto;
  }
}
