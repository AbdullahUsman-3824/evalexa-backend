import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ApplicationTaskJobData } from '../interfaces/job-data.interface';
import { ProcessingExecutorService } from '../services/processing-executor.service';

@Processor(QUEUE_NAMES.APPLICATION_PROCESSING, { concurrency: 10 })
export class ResumeParseProcessor extends WorkerHost {
  constructor(private readonly executor: ProcessingExecutorService) {
    super();
  }

  async process(job: Job<ApplicationTaskJobData>) {
    if (job.name !== 'resume-parse') return;
    return this.executor.runResumeParse(job.data);
  }
}
