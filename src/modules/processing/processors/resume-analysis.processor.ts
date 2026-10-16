import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ApplicationTaskJobData } from '../interfaces/job-data.interface';
import { ProcessingExecutorService } from '../services/processing-executor.service';

@Processor(QUEUE_NAMES.APPLICATION_PROCESSING, { concurrency: 20 })
export class ResumeAnalysisProcessor extends WorkerHost {
  constructor(private readonly executor: ProcessingExecutorService) {
    super();
  }

  async process(job: Job<ApplicationTaskJobData>) {
    switch (job.name) {
      case 'resume-parse':
        return this.executor.runResumeParse(job.data);
      case 'resume-analysis':
        return this.executor.runResumeAnalysis(job.data);
      default:
        throw new Error(`Unknown application-processing job: ${job.name}`);
    }
  }
}
