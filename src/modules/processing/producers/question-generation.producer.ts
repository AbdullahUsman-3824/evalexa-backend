import { Injectable, Logger } from '@nestjs/common';
import { QStashService } from '../../../qstash/qstash.service';

@Injectable()
export class QuestionGenerationProducer {
  private readonly logger = new Logger(QuestionGenerationProducer.name);

  constructor(private readonly qstash: QStashService) {}

  async enqueueQuestionGeneration(interviewId: string) {
    await this.qstash.addQuestionGeneration({ interviewId });
    this.logger.log(
      `Enqueued question generation for interview ${interviewId}`,
    );
  }
}
