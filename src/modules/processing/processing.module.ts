import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queues/queue-names';

// Controllers
import { ProcessingController } from './processing.controller';
import { WorkerController } from './worker.controller';

// Producers
import { ApplicationProcessingProducer } from './producers/application-processing.producer';
import { JobDeadlineProducer } from './producers/job-deadline.producer';

// Processors
import { ResumeAnalysisProcessor } from './processors/resume-analysis.processor';
import { JobWideProcessor } from './processors/job-wide.processor';
import { JobDeadlineProcessor } from './processors/job-deadline.processor';
import { ResumeParseProcessor } from './processors/resume-parse.processor';

// Services
import { JobProcessingService } from './services/job-processing.service';
import { ProcessingTaskService } from './services/processing-task.service';
import { ShortlistingService } from '../application/shortlisting.service';
import { ProcessingExecutorService } from './services/processing-executor.service';

// Modules
import { DatabaseModule } from '../../database/database.module';
import { RankingModule } from '../ranking/ranking.module';
import { ResumeModule } from '../resume/resume.module';
import { CandidateModule } from '../candidate/candidate.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { QStashModule } from '../../qstash/qstash.module';

import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.APPLICATION_PROCESSING },
      { name: QUEUE_NAMES.JOB_PROCESSING },
      { name: QUEUE_NAMES.SCHEDULED },
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
    ResumeAnalysisProcessor,
    JobWideProcessor,
    ShortlistingService,
    RecruiterRoleGuard,
    ResumeParseProcessor,
    JobDeadlineProcessor,
    ProcessingExecutorService,
  ],
  controllers: [ProcessingController, WorkerController],
  exports: [
    ApplicationProcessingProducer,
    JobDeadlineProducer,
    JobProcessingService,
    JobDeadlineProcessor,
  ],
})
export class ProcessingModule {}
