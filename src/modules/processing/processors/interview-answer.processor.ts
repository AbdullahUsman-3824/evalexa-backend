import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import {
  AnswerTranscriptionJobData,
  AnswerEvaluationJobData,
} from '../interfaces/job-data.interface';
import { ProcessingExecutorService } from '../services/processing-executor.service';

@Processor(QUEUE_NAMES.INTERVIEW_ANSWER_PROCESSING, { concurrency: 5 })
export class InterviewAnswerProcessor extends WorkerHost {
  constructor(private readonly executor: ProcessingExecutorService) {
    super();
  }

  async process(
    job: Job<AnswerTranscriptionJobData | AnswerEvaluationJobData>,
  ) {
    if (job.name === 'transcribe-answer') {
      return this.executor.runAnswerTranscription(
        job.data as AnswerTranscriptionJobData,
      );
    }
    if (job.name === 'evaluate-answer') {
      return this.executor.runAnswerEvaluation(
        job.data as AnswerEvaluationJobData,
      );
    }
    throw new Error(`Unknown interview-answer job: ${job.name}`);
  }
}
