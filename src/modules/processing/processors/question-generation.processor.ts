import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { QuestionGenerationJobData } from '../interfaces/job-data.interface';
import { ProcessingExecutorService } from '../services/processing-executor.service';

@Processor(QUEUE_NAMES.QUESTION_GENERATION, { concurrency: 5 })
export class QuestionGenerationProcessor extends WorkerHost {
  constructor(private readonly executor: ProcessingExecutorService) {
    super();
  }

  async process(job: Job<QuestionGenerationJobData>) {
    if (job.name === 'generate-questions') {
      return this.executor.runQuestionGeneration(job.data);
    }
    throw new Error(`Unknown question-generation job: ${job.name}`);
  }
}
