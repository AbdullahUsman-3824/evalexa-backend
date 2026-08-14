import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { ApplicationProcessingProducer } from './producers/application-processing.producer';
import { JobProcessingService } from './services/job-processing.service';

@Controller('processing')
@UseGuards(JwtAuthGuard, RecruiterRoleGuard)
export class ProcessingController {
  constructor(
    private readonly applicationProcessingProducer: ApplicationProcessingProducer,
    private readonly jobProcessingService: JobProcessingService,
  ) {}

  /** Retry one application (parse or analysis — auto). */
  @Post('applications/:id/retry')
  retryApplication(@Param('id') applicationId: string) {
    return this.applicationProcessingProducer.retryApplication(applicationId);
  }

  /** Retry all failed/stuck applications on a job. */
  @Post('jobs/:jobId/retry-failed')
  retryFailedForJob(@Param('jobId') jobId: string) {
    return this.applicationProcessingProducer.retryFailedApplicationsForJob(
      jobId,
    );
  }

  /** Full reprocess all applications on a job (e.g. after config change). */
  @Post('jobs/:jobId/reprocess')
  reprocessJob(@Param('jobId') jobId: string) {
    return this.applicationProcessingProducer.reprocessAllApplicationsForJob(
      jobId,
    );
  }

  /** Pipeline status + recent tasks. */
  @Get('jobs/:jobId/status')
  async jobStatus(@Param('jobId') jobId: string) {
    const status = await this.jobProcessingService.getStatusByJobId(jobId);
    if (!status) {
      throw new NotFoundException(`No processing state for job ${jobId}`);
    }
    return status;
  }
}
