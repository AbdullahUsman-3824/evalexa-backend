import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ProcessingTaskService } from '../services/processing-task.service';
import { JobProcessingService } from '../services/job-processing.service';
import { JobWideTaskJobData } from '../interfaces/job-data.interface';
import { RankingService } from '../../ranking/ranking.service';

@Processor(QUEUE_NAMES.JOB_PROCESSING)
export class RankingProcessor extends WorkerHost {
  constructor(
    private readonly taskService: ProcessingTaskService,
    private readonly jobProcessingService: JobProcessingService,
    @InjectQueue(QUEUE_NAMES.JOB_PROCESSING)
    private readonly jobQueue: Queue,
    private readonly rankingService: RankingService,
  ) {
    super();
  }

  async process(job: Job<JobWideTaskJobData>) {
    if (job.name !== 'ranking') return;

    const { jobId, jobProcessingId } = job.data;

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
      await this.jobQueue.add('shortlisting', { jobId, jobProcessingId });
    } catch (error) {
      await this.taskService.markFailed(task.id, {
        message: (error as Error).message,
      });
      await this.jobProcessingService.markJobWideFailed(jobId, {
        message: (error as Error).message,
      });
      throw error;
    }
  }
}
