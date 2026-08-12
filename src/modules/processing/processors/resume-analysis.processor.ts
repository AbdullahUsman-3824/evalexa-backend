import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ProcessingTaskService } from '../services/processing-task.service';
import { JobProcessingService } from '../services/job-processing.service';
import { ApplicationTaskJobData } from '../interfaces/job-data.interface';
import { RankingService } from '../../ranking/ranking.service';

@Processor(QUEUE_NAMES.APPLICATION_PROCESSING)
export class ResumeAnalysisProcessor extends WorkerHost {
  constructor(
    private readonly taskService: ProcessingTaskService,
    private readonly jobProcessingService: JobProcessingService,
    @InjectQueue(QUEUE_NAMES.JOB_PROCESSING)
    private readonly jobQueue: Queue,
    private readonly rankingService: RankingService,
  ) {
    super();
  }

  async process(job: Job<ApplicationTaskJobData>) {
    if (job.name !== 'resume-analysis') return;

    const { applicationId, jobId, jobProcessingId, taskId } = job.data;

    await this.jobProcessingService.setCurrentTask(
      jobId,
      ProcessingTaskType.RESUME_ANALYSIS,
    );
    await this.taskService.markRunning(taskId);

    let success = true;
    try {
      const result = await this.rankingService.scoreApplication(applicationId);

      // scoreApplication returns null (no throw) when the application or
      // its parsed resume data is missing — treat that as a failed task,
      // not a silent success.
      if (!result) {
        throw new Error('Application not found or resume not yet parsed');
      }

      await this.taskService.markCompleted(taskId);
    } catch (error) {
      success = false;
      await this.taskService.markFailed(taskId, {
        message: (error as Error).message,
      });
      // Note: we swallow the error here on purpose — one failed application
      // should NOT stop the rest of the job's pipeline (per your requirement).
    }

    const { jobProcessing, allDone } =
      await this.jobProcessingService.markApplicationDone(jobId, success);

    if (!allDone) return;

    if (jobProcessing.processedApplications === 0) {
      // Nobody succeeded — ranking/shortlisting would run on zero scored
      // applications, which is wasteful and would falsely show COMPLETED.
      await this.jobProcessingService.markJobWideNoSuccessfulApplications(
        jobId,
      );
      return;
    }

    await this.jobQueue.add('ranking', { jobId, jobProcessingId });
  }
}
