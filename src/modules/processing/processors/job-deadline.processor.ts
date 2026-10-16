import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ProcessingExecutorService } from '../services/processing-executor.service';

type CloseJobPayload = { jobId: string };

@Processor(QUEUE_NAMES.SCHEDULED, { concurrency: 5 })
export class JobDeadlineProcessor extends WorkerHost {
  constructor(private readonly executor: ProcessingExecutorService) {
    super();
  }

  async process(job: Job<CloseJobPayload>) {
    if (job.name !== 'close-job-and-shortlist') return;
    return this.executor.runCloseJob(job.data);
  }
}
