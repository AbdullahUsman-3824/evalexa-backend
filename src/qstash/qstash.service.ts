import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Client } from '@upstash/qstash';
import { QUEUE_NAMES } from '../modules/processing/queues/queue-names';

@Injectable()
export class QStashService {
  private readonly logger = new Logger(QStashService.name);
  private client: Client | null = null;
  private readonly isLocal: boolean;
  private readonly backendUrl: string;

  constructor(
    @InjectQueue(QUEUE_NAMES.APPLICATION_PROCESSING)
    private readonly appQueue: Queue,

    @InjectQueue(QUEUE_NAMES.JOB_PROCESSING)
    private readonly jobQueue: Queue,

    @InjectQueue(QUEUE_NAMES.SCHEDULED)
    private readonly scheduledQueue: Queue,
  ) {
    // Prefer explicit flag; fall back to NODE_ENV / VERCEL detection
    const forceQStash = process.env.USE_QSTASH === 'true';
    const forceLocal = process.env.USE_QSTASH === 'false';

    this.isLocal = forceLocal
      ? true
      : forceQStash
        ? false
        : process.env.NODE_ENV === 'development' || !process.env.VERCEL;

    this.backendUrl = (process.env.BACKEND_URL || '').replace(/\/+$/, '');

    if (!this.isLocal) {
      if (!process.env.QSTASH_TOKEN) {
        throw new Error('QSTASH_TOKEN is required in production');
      }
      if (!this.backendUrl) {
        throw new Error(
          'BACKEND_URL is required in production (QStash publish target)',
        );
      }
      this.client = new Client({
        token: process.env.QSTASH_TOKEN,
      });
    }

    this.logger.log(
      `QStashService initialized in ${this.isLocal ? 'LOCAL (BullMQ)' : 'PRODUCTION (QStash)'} mode`,
    );
  }

  // ==================== PRIVATE HELPERS ====================

  private async publishToQStash(
    path: string,
    body: any,
    delayInSeconds?: number,
  ) {
    if (!this.client) {
      throw new Error('QStash client not initialized');
    }

    if (!this.backendUrl) {
      throw new Error('BACKEND_URL is not configured');
    }

    const options: any = {
      url: `${this.backendUrl}${path}`,
      body,
      retries: 3,
    };

    if (delayInSeconds && delayInSeconds > 0) {
      options.delay = delayInSeconds;
    }

    const result = await this.client.publishJSON(options);
    this.logger.log(
      `[QStash] Published → ${path} | messageId: ${
        'messageId' in result ? result.messageId : 'N/A'
      }`,
    );
    return result;
  }

  // ==================== APPLICATION JOBS ====================

  async addResumeParse(data: {
    applicationId: string;
    jobId: string;
    jobProcessingId: string;
    taskId: string;
  }) {
    if (this.isLocal) {
      return this.appQueue.add('resume-parse', data, {
        jobId: `resume-parse-${data.applicationId}-${data.taskId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
    }

    return this.publishToQStash('/worker/resume-parse', data);
  }

  async addResumeAnalysis(data: {
    applicationId: string;
    jobId: string;
    jobProcessingId: string;
    taskId: string;
  }) {
    if (this.isLocal) {
      return this.appQueue.add('resume-analysis', data, {
        jobId: `resume-analysis-${data.applicationId}-${data.taskId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
    }

    return this.publishToQStash('/worker/resume-analysis', data);
  }

  // ==================== JOB LEVEL ====================

  async addRanking(data: { jobId: string; jobProcessingId: string }) {
    if (this.isLocal) {
      return this.jobQueue.add('ranking', data, {
        jobId: `ranking-${data.jobId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
    }

    return this.publishToQStash('/worker/ranking', data);
  }

  async addShortlisting(data: { jobId: string; jobProcessingId: string }) {
    if (this.isLocal) {
      return this.jobQueue.add('shortlisting', data, {
        jobId: `shortlisting-${data.jobId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
    }

    return this.publishToQStash('/worker/shortlisting', data);
  }

  // ==================== DELAYED / SCHEDULED ====================

  async scheduleJobDeadline(jobId: string, delayInSeconds: number) {
    const bullJobId = `close-job-${jobId}`;

    if (this.isLocal) {
      // Pehle purani delayed job hatao (agar ho)
      const existing = await this.scheduledQueue.getJob(bullJobId);
      if (existing) {
        await existing.remove();
      }

      return this.scheduledQueue.add(
        'close-job-and-shortlist',
        { jobId },
        {
          jobId: bullJobId,
          delay: Math.max(delayInSeconds, 0) * 1000, // BullMQ milliseconds
          attempts: 8,
          backoff: { type: 'fixed', delay: 15 * 60 * 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    // Production → QStash
    // Note: full cancel requires storing messageId (Phase 2).
    // We still publish; cancelJobDeadline logs a warning in prod.
    return this.publishToQStash(
      '/worker/close-job',
      { jobId },
      Math.max(delayInSeconds, 0),
    );
  }

  async cancelJobDeadline(jobId: string) {
    const bullJobId = `close-job-${jobId}`;

    if (this.isLocal) {
      const existing = await this.scheduledQueue.getJob(bullJobId);
      if (existing) {
        await existing.remove();
        this.logger.log(`[Local] Cancelled deadline job for ${jobId}`);
      }
      return;
    }

    // QStash cancel requires the messageId returned at publish time.
    // Without a persisted messageId we cannot cancel reliably.
    // Documented limitation — avoid re-scheduling the same job when possible.
    this.logger.warn(
      `[QStash] Cancel requested for job ${jobId}. ` +
        `MessageId is not stored yet — delayed close-job may still fire. ` +
        `(Store messageId in DB for full cancel support.)`,
    );
  }
}
