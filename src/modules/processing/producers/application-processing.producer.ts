import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { JobProcessingService } from '../services/job-processing.service';
import { ProcessingTaskService } from '../services/processing-task.service';

@Injectable()
export class ApplicationProcessingProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.APPLICATION_PROCESSING)
    private readonly appQueue: Queue,
    private readonly jobProcessingService: JobProcessingService,
    private readonly taskService: ProcessingTaskService,
  ) {}

  // Called right after an Application is created with already-structured data.
  async enqueueApplicationProcessing(applicationId: string, jobId: string) {
    const jobProcessing =
      await this.jobProcessingService.registerNewApplication(jobId);

    const analysisTask = await this.taskService.createApplicationTask(
      jobProcessing.id,
      applicationId,
      ProcessingTaskType.RESUME_ANALYSIS,
    );

    await this.appQueue.add(
      'resume-analysis',
      {
        applicationId,
        jobId,
        jobProcessingId: jobProcessing.id,
        taskId: analysisTask.id,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  // Re-enqueues a previously-failed RESUME_ANALYSIS task for one application.
  // Resolves jobId/jobProcessingId from the failed task itself, so the
  // caller (controller) only ever needs to pass applicationId.
  async retryFailedApplication(applicationId: string) {
    const task = await this.taskService.findLatestFailedTaskForApplication(
      applicationId,
      ProcessingTaskType.RESUME_ANALYSIS,
    );

    if (!task) {
      throw new NotFoundException(
        `No failed resume-analysis task found for application ${applicationId}`,
      );
    }

    const { id: jobProcessingId, jobId } = task.jobProcessing;

    await this.taskService.resetForRetry(task.id);

    // Undo the earlier failed-count so markApplicationDone doesn't
    // double-count once this retry resolves (success or failure again).
    await this.jobProcessingService.undoFailedApplication(jobId);

    await this.appQueue.add(
      'resume-analysis',
      { applicationId, jobId, jobProcessingId, taskId: task.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { applicationId, jobId, jobProcessingId, taskId: task.id };
  }
}
