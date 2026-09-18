import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queues/queue-names';
import { JobProcessingService } from './services/job-processing.service';
import { ProcessingTaskService } from './services/processing-task.service';
import { ShortlistingService } from '../application/shortlisting.service';
import { ApplicationProcessingProducer } from './producers/application-processing.producer';
import { ResumeAnalysisProcessor } from './processors/resume-analysis.processor';
import { DatabaseModule } from '../../database/database.module';
import { RankingModule } from '../ranking/ranking.module';
import { ProcessingController } from './processing.controller';
import { JobWideProcessor } from './processors/job-wide.processor';
import { JobDeadlineProcessor } from './processors/job-deadline.processor';
import { ResumeModule } from '../resume/resume.module';
import { CandidateModule } from '../candidate/candidate.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';

// import { ResumeParseProcessor } from './processors/resume-parse.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.APPLICATION_PROCESSING },
      { name: QUEUE_NAMES.JOB_PROCESSING },
    ),
    DatabaseModule,
    RankingModule,
    ResumeModule,
    CandidateModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    JobProcessingService,
    ProcessingTaskService,
    ApplicationProcessingProducer,
    ResumeAnalysisProcessor,
    JobWideProcessor,
    ShortlistingService,
    RecruiterRoleGuard,
    JobDeadlineProcessor,
    // ResumeParseProcessor,
  ],
  controllers: [ProcessingController],
  exports: [
    ApplicationProcessingProducer,
    JobProcessingService,
    JobDeadlineProcessor,
  ],
})
export class ProcessingModule {}
