import { GoneException, Injectable } from '@nestjs/common';
import { ApplicationService } from '../../application/application.service';
import { ApplyWithParsedDto } from '../../application/dto/apply-with-parsed.dto';
import { JobsService } from '../../jobs/jobs.service';
import { PublicJobApplicationDto } from '../dto/public-job-application.dto';
import { PublicJobsQueryDto } from '../dto/public-jobs-query.dto';
import { UploadedResumeFileDto } from '../../resume/dto/uploaded-resume-file.dto';

@Injectable()
export class PublicJobsService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly applicationService: ApplicationService,
  ) {}

  async findAll(query: PublicJobsQueryDto) {
    return this.jobsService.findPublicJobs(query);
  }

  async findFeatured() {
    return this.jobsService.findFeaturedPublicJobs();
  }

  async findOne(jobSlug: string) {
    return this.jobsService.findPublicJobBySlug(jobSlug);
  }

  async findSimilar(jobSlug: string) {
    return this.jobsService.findSimilarPublicJobs(jobSlug);
  }

  /**
   * jobId/companyId are ALWAYS resolved here from the trusted slug lookup,
   * never taken from the client-supplied dto. PublicJobApplicationDto must
   * not declare jobId/companyId fields at all — see the DTO file — so
   * there's no ambiguity about which value wins.
   */
  async applyToJobWithParsedData(
    jobSlug: string,
    dto: PublicJobApplicationDto,
    file: UploadedResumeFileDto,
  ) {
    const job = await this.jobsService.findPublicJobBySlug(jobSlug);

    const deadline = new Date(job.applicationDeadline);
    if (deadline < new Date()) {
      throw new GoneException('This job posting has expired');
    }

    const applicationDto: ApplyWithParsedDto = {
      ...dto,
      jobId: job.id,
      companyId: job.company.id,
    };

    return this.applicationService.applyWithParsedData(applicationDto, file);
  }
}
