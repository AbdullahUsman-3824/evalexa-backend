import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ProcessingTaskService } from '../services/processing-task.service';
import { JobProcessingService } from '../services/job-processing.service';
import { JobWideTaskJobData } from '../interfaces/job-data.interface';
import { RankingService } from '../../ranking/ranking.service';

@Processor(QUEUE_NAMES.JOB_PROCESSING, { concurrency: 5 })
export class JobWideProcessor extends WorkerHost {
  constructor(
    private readonly taskService: ProcessingTaskService,
    private readonly jobProcessingService: JobProcessingService,
    private readonly rankingService: RankingService,
    @InjectQueue(QUEUE_NAMES.JOB_PROCESSING)
    private readonly jobQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<JobWideTaskJobData>) {
    if (job.name === 'ranking') {
      return this.runRanking(job.data);
    }
    if (job.name === 'shortlisting') {
      return this.runShortlisting(job.data);
    }
  }

  private async runRanking(data: JobWideTaskJobData) {
    const { jobId, jobProcessingId } = data;

    await this.jobProcessingService.setCurrentTask(
      jobId,
      ProcessingTaskType.RANKING,
    );

    const task = await this.taskService.createJobTask(
      jobProcessingId,
      ProcessingTaskType.RANKING,
    );
    await this.taskService.markRunning(task.id);

    try {
      await this.rankingService.recalculateRanksForJob(jobId);
      await this.taskService.markCompleted(task.id);

      await this.jobQueue.add(
        'shortlisting',
        { jobId, jobProcessingId },
        {
          jobId: `shortlisting-${jobId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
    } catch (error) {
      await this.taskService.markFailed(task.id, error);
      await this.jobProcessingService.markJobWideFailed(jobId, error);
      throw error;
    }
  }

  private async runShortlisting(data: JobWideTaskJobData) {
    const { jobId, jobProcessingId } = data;

    await this.jobProcessingService.setCurrentTask(
      jobId,
      ProcessingTaskType.SHORTLISTING,
    );

    const task = await this.taskService.createJobTask(
      jobProcessingId,
      ProcessingTaskType.SHORTLISTING,
    );
    await this.taskService.markRunning(task.id);

    try {
      // TODO: replace with real shortlisting logic
      // await this.shortlistingService.shortlistTopCandidates(jobId);

      await this.taskService.markCompleted(task.id);
      await this.jobProcessingService.markJobWideComplete(jobId);
    } catch (error) {
      await this.taskService.markFailed(task.id, error);
      await this.jobProcessingService.markJobWideFailed(jobId, error);
      throw error;
    }
  }
}
