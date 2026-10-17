import { Injectable } from '@nestjs/common';
import { Prisma, ProcessingStatus, ProcessingTaskType } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class JobProcessingService {
  constructor(private readonly db: DatabaseService) {}

  // Ensures a JobProcessing row exists for this job (one row per job).
  async getOrCreate(jobId: string) {
    return this.db.jobProcessing.upsert({
      where: { jobId },
      create: { jobId, status: ProcessingStatus.PENDING },
      update: {},
    });
  }

  /**
   * Atomic register of a new application against the job's processing row.
   * - Always increments totalApplications
   * - PENDING → RUNNING (sets startedAt once)
   * - COMPLETED / FAILED + late app → reopen to RUNNING and clear terminal fields
   *
   * Uses a single SQL statement to avoid the previous get-then-update race.
   */
  async registerNewApplication(jobId: string) {
    const rows = await this.db.$queryRaw<
      {
        id: string;
        job_id: string;
        status: string;
        total_applications: number;
        processed_applications: number;
        failed_applications: number;
      }[]
    >`
      INSERT INTO job_processing (
        id, job_id, status, total_applications,
        processed_applications, failed_applications,
        started_at, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), ${jobId}::uuid, 'RUNNING', 1,
        0, 0, NOW(), NOW(), NOW()
      )
      ON CONFLICT (job_id) DO UPDATE SET
        total_applications = job_processing.total_applications + 1,
        status = CASE
          WHEN job_processing.status IN ('PENDING', 'COMPLETED', 'FAILED')
            THEN 'RUNNING'::"ProcessingStatus"
          ELSE job_processing.status
        END,
        started_at = CASE
          WHEN job_processing.status = 'PENDING' THEN NOW()
          ELSE job_processing.started_at
        END,
        completed_at = CASE
          WHEN job_processing.status IN ('COMPLETED', 'FAILED') THEN NULL
          ELSE job_processing.completed_at
        END,
        current_task = CASE
          WHEN job_processing.status IN ('COMPLETED', 'FAILED') THEN NULL
          ELSE job_processing.current_task
        END,
        last_error = CASE
          WHEN job_processing.status IN ('COMPLETED', 'FAILED') THEN NULL
          ELSE job_processing.last_error
        END,
        updated_at = NOW()
      RETURNING
        id, job_id, status,
        total_applications, processed_applications, failed_applications
    `;

    const row = rows[0];
    if (!row) {
      throw new Error(`Failed to register application for job ${jobId}`);
    }

    return {
      id: row.id,
      jobId: row.job_id,
      status: row.status as ProcessingStatus,
      totalApplications: Number(row.total_applications),
      processedApplications: Number(row.processed_applications),
      failedApplications: Number(row.failed_applications),
    };
  }

  // Marks which stage is currently active for this job.
  // Pass null when no job-wide stage is active.
  async setCurrentTask(jobId: string, taskType: ProcessingTaskType | null) {
    return this.db.jobProcessing.update({
      where: { jobId },
      data: { currentTask: taskType },
    });
  }

  // Atomic increment + "all done?" check.
  // Safe under hundreds of concurrent workers on the same job row.
  async markApplicationDone(jobId: string, success: boolean) {
    const rows = await this.db.$queryRaw<
      {
        id: string;
        total: number;
        processed: number;
        failed: number;
        all_done: boolean;
      }[]
    >`
      UPDATE job_processing
      SET
        processed_applications = processed_applications + ${success ? 1 : 0},
        failed_applications    = failed_applications    + ${success ? 0 : 1},
        updated_at = NOW()
      WHERE job_id = ${jobId}::uuid
      RETURNING
        id,
        total_applications     AS total,
        processed_applications AS processed,
        failed_applications    AS failed,
        (processed_applications + failed_applications) >= total_applications AS all_done
    `;

    const row = rows[0];
    if (!row) {
      throw new Error(`JobProcessing not found for job ${jobId}`);
    }

    return {
      jobProcessingId: row.id,
      allDone: row.all_done,
      processed: Number(row.processed),
      failed: Number(row.failed),
      total: Number(row.total),
    };
  }

  /**
   * Only one worker may start ranking for a job.
   * Relies on currentTask staying null during per-application analysis.
   */
  async claimRanking(jobId: string): Promise<boolean> {
    const result = await this.db.jobProcessing.updateMany({
      where: {
        jobId,
        status: ProcessingStatus.RUNNING,
        currentTask: null,
      },
      data: {
        currentTask: ProcessingTaskType.RANKING,
      },
    });
    return result.count === 1;
  }

  // Call when retrying a previously-failed application.
  async undoFailedApplication(jobId: string) {
    await this.db.$executeRaw`
      UPDATE job_processing
      SET
        failed_applications = GREATEST(failed_applications - 1, 0),
        updated_at = NOW()
      WHERE job_id = ${jobId}::uuid
    `;
  }

  // All applications failed resume analysis — skip ranking/shortlisting.
  async markJobWideNoSuccessfulApplications(jobId: string) {
    return this.db.jobProcessing.update({
      where: { jobId },
      data: {
        status: ProcessingStatus.FAILED,
        lastError: {
          message:
            'All applications failed resume analysis; ranking and shortlisting were skipped.',
        } as any,
        currentTask: null,
        completedAt: new Date(),
      },
    });
  }

  async markJobWideComplete(jobId: string) {
    return this.db.jobProcessing.update({
      where: { jobId },
      data: {
        status: ProcessingStatus.COMPLETED,
        completedAt: new Date(),
        currentTask: null,
      },
    });
  }

  async markJobWideFailed(jobId: string, error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error && 'message' in error
          ? String((error as any).message)
          : String(error);

    return this.db.jobProcessing.update({
      where: { jobId },
      data: {
        status: ProcessingStatus.FAILED,
        lastError: { message } as any,
        retryCount: { increment: 1 },
        currentTask: null,
        completedAt: new Date(),
      },
    });
  }

  async getStatusByJobId(jobId: string) {
    const jp = await this.db.jobProcessing.findUnique({
      where: { jobId },
    });

    if (!jp) return null;

    const total = jp.totalApplications;
    const completed = jp.processedApplications;
    const failed = jp.failedApplications;
    const processing = Math.max(total - completed - failed, 0);

    return {
      jobId: jp.jobId,
      jobProcessingId: jp.id,
      status: jp.status,
      currentTask: jp.currentTask,
      progress: {
        total,
        completed,
        processing,
        failed,
      },
      startedAt: jp.startedAt,
      completedAt: jp.completedAt,
      retryCount: jp.retryCount,
      lastError: jp.lastError,
    };
  }

  /** Before re-queueing apps: reopen terminal job so pipeline can finish again. */
  async prepareJobForApplicationRetry(jobId: string) {
    return this.db.jobProcessing.updateMany({
      where: {
        jobId,
        status: {
          in: [ProcessingStatus.COMPLETED, ProcessingStatus.FAILED],
        },
      },
      data: {
        status: ProcessingStatus.RUNNING,
        completedAt: null,
        currentTask: null,
        lastError: Prisma.DbNull,
      },
    });
  }

  /**
   * Full reprocess: reset counters to match current application set.
   * total = number of applications you are about to enqueue.
   */
  async resetForFullReprocess(jobId: string, totalApplications: number) {
    return this.db.jobProcessing.upsert({
      where: { jobId },
      create: {
        jobId,
        status: ProcessingStatus.RUNNING,
        totalApplications,
        processedApplications: 0,
        failedApplications: 0,
        startedAt: new Date(),
        currentTask: null,
      },
      update: {
        status: ProcessingStatus.RUNNING,
        totalApplications,
        processedApplications: 0,
        failedApplications: 0,
        startedAt: new Date(),
        completedAt: null,
        currentTask: null,
        lastError: Prisma.DbNull,
        retryCount: 0,
      },
    });
  }
}
