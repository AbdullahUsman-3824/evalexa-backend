import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';

@Injectable()
export class JobDeadlineProducer {
  private readonly logger = new Logger(JobDeadlineProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED)
    private readonly scheduledQueue: Queue,
  ) {}

  /**
   * Call on job create + whenever applicationDeadline changes.
   * Replaces any existing delayed job for this jobId.
   */
  async scheduleJobDeadline(jobId: string, deadline: Date | null) {
    const bullJobId = `close-job-${jobId}`;

    // Remove previous schedule (deadline changed / cleared)
    const existing = await this.scheduledQueue.getJob(bullJobId);
    if (existing) {
      await existing.remove();
      this.logger.debug(`Removed previous deadline job for ${jobId}`);
    }

    if (!deadline) {
      this.logger.debug(`No deadline for job ${jobId} — nothing scheduled`);
      return;
    }

    const delay = deadline.getTime() - Date.now();

    if (delay <= 0) {
      // Already past — run ASAP
      await this.scheduledQueue.add(
        'close-job-and-shortlist',
        { jobId },
        {
          jobId: bullJobId,
          delay: 0,
          attempts: 5,
          backoff: { type: 'fixed', delay: 15 * 60 * 1000 }, // retry every 15m if ranking not ready
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(`Job ${jobId} deadline already passed — queued immediately`);
      return;
    }

    await this.scheduledQueue.add(
      'close-job-and-shortlist',
      { jobId },
      {
        jobId: bullJobId,
        delay,
        attempts: 8, // ranking late ho to retries
        backoff: { type: 'fixed', delay: 15 * 60 * 1000 }, // 15 min between retries
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Scheduled close-job-and-shortlist for ${jobId} in ${Math.round(delay / 1000)}s (at ${deadline.toISOString()})`,
    );
  }

  /** Call if job deleted / archived before deadline */
  async cancelJobDeadline(jobId: string) {
    const bullJobId = `close-job-${jobId}`;
    const existing = await this.scheduledQueue.getJob(bullJobId);
    if (existing) {
      await existing.remove();
      this.logger.log(`Cancelled deadline job for ${jobId}`);
    }
  }
}