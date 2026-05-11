import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCompaniesQueryDto } from '../dto/public-companies-query.dto';
import { PublicJobsQueryDto } from '../dto/public-jobs-query.dto';
import { PublicCompaniesService } from '../services/public-companies.service';

@Controller('public/companies')
export class PublicCompaniesController {
  constructor(
    private readonly publicCompaniesService: PublicCompaniesService,
  ) {}

  @Get()
  findAll(@Query() query: PublicCompaniesQueryDto) {
    return this.publicCompaniesService.findAll(query);
  }

  @Get(':companySlug/jobs')
  findJobs(
    @Param('companySlug') companySlug: string,
    @Query() query: PublicJobsQueryDto,
  ) {
    return this.publicCompaniesService.findJobs(companySlug, query);
  }

  @Get(':companySlug')
  findOne(@Param('companySlug') companySlug: string) {
    return this.publicCompaniesService.findOne(companySlug);
  }
}
