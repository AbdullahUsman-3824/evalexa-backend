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
    return this.db.processingTask.update({
      where: { id: taskId },
      data: {
        status: ProcessingStatus.FAILED,
        error: error as any,
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
}
