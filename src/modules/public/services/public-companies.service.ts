import { Injectable } from '@nestjs/common';
import { CompanyService } from '../../company/company.service';
import { JobsService } from '../../jobs/jobs.service';
import { PublicCompaniesQueryDto } from '../dto/public-companies-query.dto';
import { PublicJobsQueryDto } from '../dto/public-jobs-query.dto';

@Injectable()
export class PublicCompaniesService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly jobsService: JobsService,
  ) {}

  async findAll(query: PublicCompaniesQueryDto) {
    return this.companyService.findPublicCompanies(query);
  }

  async findOne(companySlug: string) {
    return this.companyService.findPublicCompanyBySlug(companySlug);
  }

  async findJobs(companySlug: string, query: PublicJobsQueryDto) {
    const company =
      await this.companyService.findPublicCompanyBySlug(companySlug);
    return this.jobsService.findPublicJobsByCompanyId(company.id, query);
  }
}
