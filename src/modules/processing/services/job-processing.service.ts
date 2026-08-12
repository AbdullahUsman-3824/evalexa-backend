import { Injectable } from '@nestjs/common';
import { ProcessingStatus, ProcessingTaskType } from '@prisma/client';
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

  // Call this whenever a new application starts being processed.
  async registerNewApplication(jobId: string) {
    await this.getOrCreate(jobId);

    return this.db.jobProcessing.update({
      where: { jobId },
      data: {
        totalApplications: { increment: 1 },
        status: ProcessingStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  // Marks which stage is currently active for this job. Pass null when
  // no stage is running (job finished, or before the first stage starts).
  async setCurrentTask(jobId: string, taskType: ProcessingTaskType | null) {
    return this.db.jobProcessing.update({
      where: { jobId },
      data: { currentTask: taskType },
    });
  }

  // Call when one application's per-application tasks finish (success or fail).
  // Returns whether ALL applications for this job are now done — safe to
  // check because Postgres serializes concurrent increments on the same row.
  async markApplicationDone(jobId: string, success: boolean) {
    const updated = await this.db.jobProcessing.update({
      where: { jobId },
      data: success
        ? { processedApplications: { increment: 1 } }
        : { failedApplications: { increment: 1 } },
    });

    const allDone =
      updated.processedApplications + updated.failedApplications >=
      updated.totalApplications;

    return { jobProcessing: updated, allDone };
  }

  // Call when retrying a previously-failed application, so the earlier
  // failed-count doesn't get double-counted once the retry resolves.
  async undoFailedApplication(jobId: string) {
    return this.db.jobProcessing.update({
      where: { jobId },
      data: { failedApplications: { decrement: 1 } },
    });
  }

  // Call when NO applications succeeded (all failed resume analysis).
  // Skips ranking/shortlisting entirely — there's nothing to rank — and
  // marks the job FAILED so status honestly reflects the outcome instead
  // of showing COMPLETED for a pipeline that produced zero scored applications.
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
    return this.db.jobProcessing.update({
      where: { jobId },
      data: {
        status: ProcessingStatus.FAILED,
        lastError: error as any,
        retryCount: { increment: 1 },
      },
    });
  }
}
