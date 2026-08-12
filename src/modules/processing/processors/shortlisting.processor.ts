import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ProcessingTaskService } from '../services/processing-task.service';
import { JobProcessingService } from '../services/job-processing.service';
import { JobWideTaskJobData } from '../interfaces/job-data.interface';
// import { ShortlistingService } from '../../shortlisting/shortlisting.service'; // TODO

@Processor(QUEUE_NAMES.JOB_PROCESSING)
export class ShortlistingProcessor extends WorkerHost {
  constructor(
    private readonly taskService: ProcessingTaskService,
    private readonly jobProcessingService: JobProcessingService,
    // private readonly shortlistingService: ShortlistingService,
  ) {
    super();
  }

  async process(job: Job<JobWideTaskJobData>) {
    if (job.name !== 'shortlisting') return;

    const { jobId, jobProcessingId } = job.data;

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
      // TODO: replace with your real shortlisting logic
      // await this.shortlistingService.shortlistTopCandidates(jobId);

      await this.taskService.markCompleted(task.id);
      await this.jobProcessingService.markJobWideComplete(jobId);
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
