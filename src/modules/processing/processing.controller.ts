import {
  Controller,
  Get,
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

    if (status) {
      return status;
    }

    const created = await this.jobProcessingService.getOrCreate(jobId);

    return {
      jobId: created.jobId,
      jobProcessingId: created.id,
      status: created.status,
      currentTask: created.currentTask,
      progress: {
        total: created.totalApplications,
        completed: created.processedApplications,
        processing: Math.max(
          created.totalApplications -
            created.processedApplications -
            created.failedApplications,
          0,
        ),
        failed: created.failedApplications,
      },
      startedAt: created.startedAt,
      completedAt: created.completedAt,
      retryCount: created.retryCount,
      lastError: created.lastError,
    };
  }
}
