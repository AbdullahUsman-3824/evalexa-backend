// import { NotFoundException, Injectable } from '@nestjs/common';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import { ProcessingStatus, ProcessingTaskType } from '@prisma/client';
// import { QUEUE_NAMES } from '../queues/queue-names';
// import { JobProcessingService } from '../services/job-processing.service';
// import { ProcessingTaskService } from '../services/processing-task.service';
// import { DatabaseService } from '../../../database/database.service';

// @Injectable()
// export class ApplicationProcessingProducer {
//   constructor(
//     @InjectQueue(QUEUE_NAMES.APPLICATION_PROCESSING)
//     private readonly appQueue: Queue,
//     private readonly jobProcessingService: JobProcessingService,
//     private readonly taskService: ProcessingTaskService,
//     private readonly db: DatabaseService,
//   ) {}

//   // Called right after an Application is created with already-structured data.
//   async enqueueApplicationProcessing(applicationId: string, jobId: string) {
//     const jobProcessing =
//       await this.jobProcessingService.registerNewApplication(jobId);

//     const analysisTask = await this.taskService.createApplicationTask(
//       jobProcessing.id,
//       applicationId,
//       ProcessingTaskType.RESUME_ANALYSIS,
//     );

//     await this.appQueue.add(
//       'resume-analysis',
//       {
//         applicationId,
//         jobId,
//         jobProcessingId: jobProcessing.id,
//         taskId: analysisTask.id,
//       },
//       {
//         jobId: `resume-analysis-${applicationId}-${analysisTask.id}`,
//         attempts: 3,
//         backoff: { type: 'exponential', delay: 5000 },
//         removeOnComplete: true,
//       },
//     );
//   }

//   /**
//    * Bulk path: application exists, resume file is stored, parsedData is empty.
//    * Starts at RESUME_PARSE; processor will chain into resume-analysis.
//    */
//   async enqueueResumeParse(applicationId: string, jobId: string) {
//     const jobProcessing =
//       await this.jobProcessingService.registerNewApplication(jobId);

//     const parseTask = await this.taskService.createApplicationTask(
//       jobProcessing.id,
//       applicationId,
//       ProcessingTaskType.RESUME_PARSE,
//     );

//     await this.appQueue.add(
//       'resume-parse',
//       {
//         applicationId,
//         jobId,
//         jobProcessingId: jobProcessing.id,
//         taskId: parseTask.id,
//       },
//       {
//         jobId: `resume-parse-${applicationId}-${parseTask.id}`,
//         attempts: 3,
//         backoff: { type: 'exponential', delay: 5000 },
//         removeOnComplete: true,
//       },
//     );

//     return {
//       applicationId,
//       jobId,
//       jobProcessingId: jobProcessing.id,
//       taskId: parseTask.id,
//     };
//   }

//   private queueJobName(
//     taskType: ProcessingTaskType,
//   ): 'resume-parse' | 'resume-analysis' {
//     if (taskType === ProcessingTaskType.RESUME_PARSE) return 'resume-parse';
//     if (taskType === ProcessingTaskType.RESUME_ANALYSIS)
//       return 'resume-analysis';
//     throw new Error(`Not an application-stage task: ${taskType}`);
//   }

//   /**
//    * UI: retry one application from its latest failed/stuck parse or analysis task.
//    */
//   async retryApplication(applicationId: string) {
//     const task =
//       await this.taskService.findLatestRetryableTaskForApplication(
//         applicationId,
//       );

//     if (!task?.applicationId || !task.jobProcessing) {
//       throw new NotFoundException(
//         `No failed or pending parse/analysis task for application ${applicationId}`,
//       );
//     }

//     const { id: jobProcessingId, jobId } = task.jobProcessing;
//     const wasFailed = task.status === ProcessingStatus.FAILED;

//     await this.taskService.resetForRetry(task.id);

//     if (wasFailed) {
//       await this.jobProcessingService.undoFailedApplication(jobId);
//     }

//     await this.jobProcessingService.prepareJobForApplicationRetry(jobId);

//     const jobName = this.queueJobName(task.taskType);

//     await this.appQueue.add(
//       jobName,
//       {
//         applicationId,
//         jobId,
//         jobProcessingId,
//         taskId: task.id,
//       },
//       {
//         jobId: `${jobName}-retry-${applicationId}-${task.id}-${Date.now()}`,
//         attempts: 3,
//         backoff: { type: 'exponential', delay: 5000 },
//         removeOnComplete: true,
//       },
//     );

//     return {
//       applicationId,
//       jobId,
//       jobProcessingId,
//       taskId: task.id,
//       taskType: task.taskType,
//       jobName,
//     };
//   }

//   /**
//    * UI: retry all failed/stuck applications for a job.
//    */
//   async retryFailedApplicationsForJob(jobId: string) {
//     const tasks =
//       await this.taskService.findRetryableApplicationTasksForJob(jobId);

//     if (tasks.length === 0) {
//       return { jobId, retried: 0, results: [] as const };
//     }

//     await this.jobProcessingService.prepareJobForApplicationRetry(jobId);

//     const results: Array<{
//       applicationId: string;
//       taskId: string;
//       taskType: ProcessingTaskType;
//       jobName: 'resume-parse' | 'resume-analysis';
//     }> = [];

//     for (const task of tasks) {
//       if (!task.applicationId) continue;

//       const wasFailed = task.status === ProcessingStatus.FAILED;

//       await this.taskService.resetForRetry(task.id);

//       if (wasFailed) {
//         await this.jobProcessingService.undoFailedApplication(jobId);
//       }

//       const jobName = this.queueJobName(task.taskType);

//       await this.appQueue.add(
//         jobName,
//         {
//           applicationId: task.applicationId,
//           jobId,
//           jobProcessingId: task.jobProcessing.id,
//           taskId: task.id,
//         },
//         {
//           jobId: `${jobName}-retry-${task.applicationId}-${task.id}-${Date.now()}`,
//           attempts: 3,
//           backoff: { type: 'exponential', delay: 5000 },
//           removeOnComplete: true,
//         },
//       );

//       results.push({
//         applicationId: task.applicationId,
//         taskId: task.id,
//         taskType: task.taskType,
//         jobName,
//       });
//     }

//     return { jobId, retried: results.length, results };
//   }

//   /**
//    * Full job reprocess (config change, etc.).
//    * - Resets JobProcessing counters
//    * - Re-queues every application
//    * - Starts at ANALYSIS if parsedData exists, else PARSE
//    */
//   async reprocessAllApplicationsForJob(jobId: string) {
//     const applications = await this.db.application.findMany({
//       where: { jobId },
//       select: {
//         id: true,
//         resume: {
//           select: { id: true, parsedData: true },
//         },
//       },
//     });

//     if (applications.length === 0) {
//       return { jobId, requeued: 0, results: [] as const };
//     }

//     const jobProcessing = await this.jobProcessingService.resetForFullReprocess(
//       jobId,
//       applications.length,
//     );

//     await this.taskService.cancelOpenApplicationTasks(jobProcessing.id);

//     // Clear old scores/ranks so ranking is honest after re-score
//     await this.db.application.updateMany({
//       where: { jobId },
//       data: {
//         matchScore: null,
//         rankPosition: null,
//         isAutoShortlisted: false,
//         // status: leave APPLIED / SHORTLISTED as you prefer; safest for full reprocess:
//         // status: ApplicationStatus.APPLIED,
//       },
//     });

//     const results: Array<{
//       applicationId: string;
//       taskId: string;
//       taskType: ProcessingTaskType;
//       jobName: 'resume-parse' | 'resume-analysis';
//     }> = [];

//     for (const app of applications) {
//       const hasParsedData = app.resume?.parsedData != null;

//       const taskType = hasParsedData
//         ? ProcessingTaskType.RESUME_ANALYSIS
//         : ProcessingTaskType.RESUME_PARSE;

//       const task = await this.taskService.createApplicationTask(
//         jobProcessing.id,
//         app.id,
//         taskType,
//       );

//       const jobName = this.queueJobName(taskType);

//       await this.appQueue.add(
//         jobName,
//         {
//           applicationId: app.id,
//           jobId,
//           jobProcessingId: jobProcessing.id,
//           taskId: task.id,
//         },
//         {
//           jobId: `${jobName}-reprocess-${app.id}-${task.id}-${Date.now()}`,
//           attempts: 3,
//           backoff: { type: 'exponential', delay: 5000 },
//           removeOnComplete: true,
//         },
//       );

//       results.push({
//         applicationId: app.id,
//         taskId: task.id,
//         taskType,
//         jobName,
//       });
//     }

//     return { jobId, requeued: results.length, results };
//   }
// }



import { NotFoundException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpService } from '@nestjs/axios';
import { Queue } from 'bullmq';
import { ProcessingStatus, ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { JobProcessingService } from '../services/job-processing.service';
import { ProcessingTaskService } from '../services/processing-task.service';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class ApplicationProcessingProducer {
  private readonly logger = new Logger(ApplicationProcessingProducer.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.APPLICATION_PROCESSING)
    private readonly appQueue: Queue,
    private readonly jobProcessingService: JobProcessingService,
    private readonly taskService: ProcessingTaskService,
    private readonly db: DatabaseService,
    private readonly httpService: HttpService,
  ) { }

  private async triggerWorker() {
    try {
      await this.httpService.axiosRef.post(
        `https://api.github.com/repos/${process.env.GH_REPO}/dispatches`,
        { event_type: 'job-enqueued' },
        {
          headers: {
            Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );
    } catch (err) {
      this.logger.warn(`GitHub dispatch trigger failed: ${err}`);
    }
  }

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
      {
        jobId: `resume-analysis-${applicationId}-${analysisTask.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );

    await this.triggerWorker();
  }

  /**
   * Bulk path: application exists, resume file is stored, parsedData is empty.
   * Starts at RESUME_PARSE; processor will chain into resume-analysis.
   */
  async enqueueResumeParse(applicationId: string, jobId: string) {
    const jobProcessing =
      await this.jobProcessingService.registerNewApplication(jobId);

    const parseTask = await this.taskService.createApplicationTask(
      jobProcessing.id,
      applicationId,
      ProcessingTaskType.RESUME_PARSE,
    );

    await this.appQueue.add(
      'resume-parse',
      {
        applicationId,
        jobId,
        jobProcessingId: jobProcessing.id,
        taskId: parseTask.id,
      },
      {
        jobId: `resume-parse-${applicationId}-${parseTask.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );

    await this.triggerWorker();

    return {
      applicationId,
      jobId,
      jobProcessingId: jobProcessing.id,
      taskId: parseTask.id,
    };
  }

  private queueJobName(
    taskType: ProcessingTaskType,
  ): 'resume-parse' | 'resume-analysis' {
    if (taskType === ProcessingTaskType.RESUME_PARSE) return 'resume-parse';
    if (taskType === ProcessingTaskType.RESUME_ANALYSIS)
      return 'resume-analysis';
    throw new Error(`Not an application-stage task: ${taskType}`);
  }

  /**
   * UI: retry one application from its latest failed/stuck parse or analysis task.
   */
  async retryApplication(applicationId: string) {
    const task =
      await this.taskService.findLatestRetryableTaskForApplication(
        applicationId,
      );

    if (!task?.applicationId || !task.jobProcessing) {
      throw new NotFoundException(
        `No failed or pending parse/analysis task for application ${applicationId}`,
      );
    }

    const { id: jobProcessingId, jobId } = task.jobProcessing;
    const wasFailed = task.status === ProcessingStatus.FAILED;

    await this.taskService.resetForRetry(task.id);

    if (wasFailed) {
      await this.jobProcessingService.undoFailedApplication(jobId);
    }

    await this.jobProcessingService.prepareJobForApplicationRetry(jobId);

    const jobName = this.queueJobName(task.taskType);

    await this.appQueue.add(
      jobName,
      {
        applicationId,
        jobId,
        jobProcessingId,
        taskId: task.id,
      },
      {
        jobId: `${jobName}-retry-${applicationId}-${task.id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );

    await this.triggerWorker();

    return {
      applicationId,
      jobId,
      jobProcessingId,
      taskId: task.id,
      taskType: task.taskType,
      jobName,
    };
  }

  /**
   * UI: retry all failed/stuck applications for a job.
   */
  async retryFailedApplicationsForJob(jobId: string) {
    const tasks =
      await this.taskService.findRetryableApplicationTasksForJob(jobId);

    if (tasks.length === 0) {
      return { jobId, retried: 0, results: [] as const };
    }

    await this.jobProcessingService.prepareJobForApplicationRetry(jobId);

    const results: Array<{
      applicationId: string;
      taskId: string;
      taskType: ProcessingTaskType;
      jobName: 'resume-parse' | 'resume-analysis';
    }> = [];

    for (const task of tasks) {
      if (!task.applicationId) continue;

      const wasFailed = task.status === ProcessingStatus.FAILED;

      await this.taskService.resetForRetry(task.id);

      if (wasFailed) {
        await this.jobProcessingService.undoFailedApplication(jobId);
      }

      const jobName = this.queueJobName(task.taskType);

      await this.appQueue.add(
        jobName,
        {
          applicationId: task.applicationId,
          jobId,
          jobProcessingId: task.jobProcessing.id,
          taskId: task.id,
        },
        {
          jobId: `${jobName}-retry-${task.applicationId}-${task.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );

      results.push({
        applicationId: task.applicationId,
        taskId: task.id,
        taskType: task.taskType,
        jobName,
      });
    }

    await this.triggerWorker();

    return { jobId, retried: results.length, results };
  }

  /**
   * Full job reprocess (config change, etc.).
   * - Resets JobProcessing counters
   * - Re-queues every application
   * - Starts at ANALYSIS if parsedData exists, else PARSE
   */
  async reprocessAllApplicationsForJob(jobId: string) {
    const applications = await this.db.application.findMany({
      where: { jobId },
      select: {
        id: true,
        resume: {
          select: { id: true, parsedData: true },
        },
      },
    });

    if (applications.length === 0) {
      return { jobId, requeued: 0, results: [] as const };
    }

    const jobProcessing = await this.jobProcessingService.resetForFullReprocess(
      jobId,
      applications.length,
    );

    await this.taskService.cancelOpenApplicationTasks(jobProcessing.id);

    // Clear old scores/ranks so ranking is honest after re-score
    await this.db.application.updateMany({
      where: { jobId },
      data: {
        matchScore: null,
        rankPosition: null,
        isAutoShortlisted: false,
        // status: leave APPLIED / SHORTLISTED as you prefer; safest for full reprocess:
        // status: ApplicationStatus.APPLIED,
      },
    });

    const results: Array<{
      applicationId: string;
      taskId: string;
      taskType: ProcessingTaskType;
      jobName: 'resume-parse' | 'resume-analysis';
    }> = [];

    for (const app of applications) {
      const hasParsedData = app.resume?.parsedData != null;

      const taskType = hasParsedData
        ? ProcessingTaskType.RESUME_ANALYSIS
        : ProcessingTaskType.RESUME_PARSE;

      const task = await this.taskService.createApplicationTask(
        jobProcessing.id,
        app.id,
        taskType,
      );

      const jobName = this.queueJobName(taskType);

      await this.appQueue.add(
        jobName,
        {
          applicationId: app.id,
          jobId,
          jobProcessingId: jobProcessing.id,
          taskId: task.id,
        },
        {
          jobId: `${jobName}-reprocess-${app.id}-${task.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );

      results.push({
        applicationId: app.id,
        taskId: task.id,
        taskType,
        jobName,
      });
    }

    await this.triggerWorker();

    return { jobId, requeued: results.length, results };
  }
}