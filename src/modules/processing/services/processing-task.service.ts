import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProcessingStatus,
  ProcessingTaskType,
  TaskScope,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class ProcessingTaskService {
  constructor(private readonly db: DatabaseService) {}

  createApplicationTask(
    jobProcessingId: string,
    applicationId: string,
    taskType: ProcessingTaskType,
  ) {
    return this.db.processingTask.create({
      data: {
        jobProcessingId,
        applicationId,
        scope: TaskScope.APPLICATION,
        taskType,
        status: ProcessingStatus.PENDING,
      },
    });
  }

  createJobTask(jobProcessingId: string, taskType: ProcessingTaskType) {
    return this.db.processingTask.create({
      data: {
        jobProcessingId,
        scope: TaskScope.JOB,
        taskType,
        status: ProcessingStatus.PENDING,
      },
    });
  }

  markRunning(taskId: string) {
    return this.db.processingTask.update({
      where: { id: taskId },
      data: { status: ProcessingStatus.RUNNING, startedAt: new Date() },
    });
  }

  markCompleted(taskId: string) {
    return this.db.processingTask.update({
      where: { id: taskId },
      data: { status: ProcessingStatus.COMPLETED, completedAt: new Date() },
    });
  }

  markFailed(taskId: string, error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error && 'message' in error
          ? String((error as any).message)
          : String(error);

    return this.db.processingTask.update({
      where: { id: taskId },
      data: {
        status: ProcessingStatus.FAILED,
        error: { message },
        retryCount: { increment: 1 },
        completedAt: new Date(),
      },
    });
  }

  // Finds the most recent FAILED task for an application, along with the
  // parent JobProcessing row (so callers get jobId + jobProcessingId in
  // one query — used by the retry flow, which only has applicationId).
  findLatestFailedTaskForApplication(
    applicationId: string,
    taskType: ProcessingTaskType,
  ) {
    return this.db.processingTask.findFirst({
      where: { applicationId, taskType, status: ProcessingStatus.FAILED },
      orderBy: { createdAt: 'desc' },
      include: { jobProcessing: { select: { id: true, jobId: true } } },
    });
  }

  /** Latest failed PARSE or ANALYSIS for one application (auto stage). */
  findLatestRetryableTaskForApplication(applicationId: string) {
    return this.db.processingTask.findFirst({
      where: {
        applicationId,
        scope: TaskScope.APPLICATION,
        taskType: {
          in: [
            ProcessingTaskType.RESUME_PARSE,
            ProcessingTaskType.RESUME_ANALYSIS,
          ],
        },
        status: {
          in: [ProcessingStatus.FAILED, ProcessingStatus.PENDING],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        jobProcessing: { select: { id: true, jobId: true, status: true } },
      },
    });
  }

  /** All failed/stuck application tasks for a job (one per application: latest). */
  async findRetryableApplicationTasksForJob(jobId: string) {
    const jobProcessing = await this.db.jobProcessing.findUnique({
      where: { jobId },
      select: { id: true },
    });
    if (!jobProcessing) return [];

    const tasks = await this.db.processingTask.findMany({
      where: {
        jobProcessingId: jobProcessing.id,
        scope: TaskScope.APPLICATION,
        applicationId: { not: null },
        taskType: {
          in: [
            ProcessingTaskType.RESUME_PARSE,
            ProcessingTaskType.RESUME_ANALYSIS,
          ],
        },
        status: {
          in: [ProcessingStatus.FAILED, ProcessingStatus.PENDING],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        jobProcessing: { select: { id: true, jobId: true, status: true } },
      },
    });

    // One task per application (latest first already)
    const seen = new Set<string>();
    const unique: typeof tasks = [];
    for (const t of tasks) {
      if (!t.applicationId || seen.has(t.applicationId)) continue;
      seen.add(t.applicationId);
      unique.push(t);
    }
    return unique;
  }

  // Resets a failed task back to PENDING so it can be re-run.
  resetForRetry(taskId: string) {
    return this.db.processingTask.update({
      where: { id: taskId },
      data: {
        status: ProcessingStatus.PENDING,
        error: Prisma.DbNull,
        startedAt: null,
        completedAt: null,
      },
    });
  }

  async cancelOpenApplicationTasks(jobProcessingId: string) {
    return this.db.processingTask.updateMany({
      where: {
        jobProcessingId,
        scope: TaskScope.APPLICATION,
        status: {
          in: [
            ProcessingStatus.PENDING,
            ProcessingStatus.RUNNING,
            ProcessingStatus.FAILED,
          ],
        },
      },
      data: {
        status: ProcessingStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }
}
