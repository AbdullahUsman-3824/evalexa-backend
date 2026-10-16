import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { JobWideTaskJobData } from '../interfaces/job-data.interface';
import { ProcessingExecutorService } from '../services/processing-executor.service';

@Processor(QUEUE_NAMES.JOB_PROCESSING, { concurrency: 5 })
export class JobWideProcessor extends WorkerHost {
  constructor(private readonly executor: ProcessingExecutorService) {
    super();
  }

  async process(job: Job<JobWideTaskJobData>) {
    if (job.name === 'ranking') {
      return this.executor.runRanking(job.data);
    }

    if (job.name === 'shortlisting') {
      return this.executor.runShortlisting(job.data);
    }
  }
}
