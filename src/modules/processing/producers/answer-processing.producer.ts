import { Injectable, Logger } from '@nestjs/common';
import { QStashService } from '../../../common/infrastructure/qstash/qstash.service';

@Injectable()
export class AnswerProcessingProducer {
  private readonly logger = new Logger(AnswerProcessingProducer.name);

  constructor(private readonly qstash: QStashService) {}

  async enqueueTranscription(interviewId: string, questionId: string) {
    await this.qstash.addAnswerTranscription({ interviewId, questionId });
    this.logger.log(
      `Enqueued transcription for interview ${interviewId} question ${questionId}`,
    );
  }

  async enqueueEvaluation(interviewId: string, questionId: string) {
    await this.qstash.addAnswerEvaluation({ interviewId, questionId });
    this.logger.log(
      `Enqueued evaluation for interview ${interviewId} question ${questionId}`,
    );
  }
}
