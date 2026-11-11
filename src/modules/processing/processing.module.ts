import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queues/queue-names';

// Controllers
import { ProcessingController } from './processing.controller';
import { WorkerController } from './worker.controller';

// Producers
import { ApplicationProcessingProducer } from './producers/application-processing.producer';
import { JobDeadlineProducer } from './producers/job-deadline.producer';
import { QuestionGenerationProducer } from './producers/question-generation.producer';
import { AnswerProcessingProducer } from './producers/answer-processing.producer';

// Processors — single processor per queue to avoid dual-worker races
import { ResumeAnalysisProcessor } from './processors/resume-analysis.processor';
import { JobWideProcessor } from './processors/job-wide.processor';
import { JobDeadlineProcessor } from './processors/job-deadline.processor';
import { QuestionGenerationProcessor } from './processors/question-generation.processor';
import { InterviewAnswerProcessor } from './processors/interview-answer.processor';

// Services
import { JobProcessingService } from './services/job-processing.service';
import { ProcessingTaskService } from './services/processing-task.service';
import { ShortlistingService } from '../application/shortlisting.service';
import { ProcessingExecutorService } from './services/processing-executor.service';
import { InterviewQuestionService } from '../interview/services/interview-question.service';
import { InterviewTranscriptionService } from '../interview/services/interview-transcription.service';
import { InterviewEvaluationService } from '../interview/services/interview-evaluation.service';

// Modules
import { DatabaseModule } from '../../database/database.module';
import { RankingModule } from '../ranking/ranking.module';
import { ResumeModule } from '../resume/resume.module';
import { CandidateModule } from '../candidate/candidate.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { QStashModule } from '../../common/infrastructure/qstash/qstash.module';

import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.APPLICATION_PROCESSING },
      { name: QUEUE_NAMES.JOB_PROCESSING },
      { name: QUEUE_NAMES.SCHEDULED },
      { name: QUEUE_NAMES.QUESTION_GENERATION },
      { name: QUEUE_NAMES.INTERVIEW_ANSWER_PROCESSING },
    ),
    DatabaseModule,
    RankingModule,
    ResumeModule,
    CandidateModule,
    AuthModule,
    UsersModule,
    QStashModule,
  ],
  providers: [
    JobProcessingService,
    ProcessingTaskService,
    ApplicationProcessingProducer,
    JobDeadlineProducer,
    QuestionGenerationProducer,
    AnswerProcessingProducer,
    ResumeAnalysisProcessor,
    JobWideProcessor,
    QuestionGenerationProcessor,
    InterviewAnswerProcessor,
    ShortlistingService,
    RecruiterRoleGuard,
    JobDeadlineProcessor,
    ProcessingExecutorService,
    InterviewQuestionService,
    InterviewTranscriptionService,
    InterviewEvaluationService,
  ],
  controllers: [ProcessingController, WorkerController],
  exports: [
    ApplicationProcessingProducer,
    QuestionGenerationProducer,
    AnswerProcessingProducer,
    JobDeadlineProducer,
    JobProcessingService,
    JobDeadlineProcessor,
  ],
})
export class ProcessingModule {}
