import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queues/queue-names';
import { JobProcessingService } from './services/job-processing.service';
import { ProcessingTaskService } from './services/processing-task.service';
import { ApplicationProcessingProducer } from './producers/application-processing.producer';
import { ResumeAnalysisProcessor } from './processors/resume-analysis.processor';
import { RankingProcessor } from './processors/ranking.processor';
import { ShortlistingProcessor } from './processors/shortlisting.processor';
import { DatabaseModule } from '../../database/database.module';
import { RankingModule } from '../ranking/ranking.module';
import { ProcessingController } from './processing.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.APPLICATION_PROCESSING },
      { name: QUEUE_NAMES.JOB_PROCESSING },
    ),
    DatabaseModule,
    RankingModule,
  ],
  providers: [
    JobProcessingService,
    ProcessingTaskService,
    ApplicationProcessingProducer,
    ResumeAnalysisProcessor,
    RankingProcessor,
    ShortlistingProcessor,
  ],
  controllers: [ProcessingController],
  exports: [ApplicationProcessingProducer, JobProcessingService],
})
export class ProcessingModule {}
