import { Module } from '@nestjs/common';
import { ApplicationModule } from '../application/application.module';
import { CompanyModule } from '../company/company.module';
import { JobsModule } from '../jobs/jobs.module';
import { ResumeModule } from '../resume/resume.module';
import { PublicCompaniesController } from './controllers/public-companies.controller';
import { PublicJobsController } from './controllers/public-jobs.controller';
import { PublicCompaniesService } from './services/public-companies.service';
import { PublicJobsService } from './services/public-jobs.service';

@Module({
  imports: [JobsModule, CompanyModule, ApplicationModule, ResumeModule],
  controllers: [PublicJobsController, PublicCompaniesController],
  providers: [PublicJobsService, PublicCompaniesService],
})
export class PublicModule {}
