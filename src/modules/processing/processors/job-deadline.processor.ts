import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobStatus, ProcessingStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { DatabaseService } from '../../../database/database.service';
import { ShortlistingService } from '../../application/shortlisting.service';

type CloseJobPayload = { jobId: string };

@Processor(QUEUE_NAMES.SCHEDULED, { concurrency: 5 })
export class JobDeadlineProcessor extends WorkerHost {
  private readonly logger = new Logger(JobDeadlineProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly shortlistingService: ShortlistingService,
  ) {
    super();
  }

  async process(job: Job<CloseJobPayload>) {
    if (job.name !== 'close-job-and-shortlist') return;

    const { jobId } = job.data;
    const row = await this.db.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        applicationDeadline: true,
        aiConfig: {
          select: {
            enableAutoShortlisting: true,
            shortlistLimit: true,
            minimumMatchScore: true,
          },
        },
        jobProcessing: { select: { status: true } },
      },
    });

    if (!row) {
      this.logger.warn(`Job ${jobId} not found — skipping`);
      return;
    }

    // Idempotent close
    if (row.status === JobStatus.OPEN) {
      await this.db.job.update({
        where: { id: jobId },
        data: { status: JobStatus.CLOSED },
      });
      this.logger.log(`Closed job ${jobId} (deadline reached)`);
    }

    // Auto shortlist?
    if (!row.aiConfig?.enableAutoShortlisting) {
      return { closed: true, shortlisted: 0, reason: 'AUTO_DISABLED' };
    }

    const rankingReady = await this.isRankingReady(
      jobId,
      row.jobProcessing?.status,
    );

    if (!rankingReady) {
      // Throw → BullMQ retries with backoff (wait rule)
      this.logger.warn(
        `Job ${jobId}: ranking not ready — will retry (attempt ${job.attemptsMade + 1})`,
      );
      throw new Error('RANKING_NOT_READY');
    }

    const result = await this.shortlistingService.runAutoShortlistForJob(jobId);

    this.logger.log(
      `Job ${jobId}: auto shortlisted ${result.shortlisted}/${result.requested}` +
        (result.skippedReason ? ` (${result.skippedReason})` : ''),
    );

    return result;
  }

  private async isRankingReady(
    jobId: string,
    processingStatus?: ProcessingStatus,
  ): Promise<boolean> {
    if (processingStatus === ProcessingStatus.COMPLETED) return true;

    const ranked = await this.db.application.count({
      where: { jobId, rankPosition: { not: null } },
    });
    return ranked > 0;
  }
}
