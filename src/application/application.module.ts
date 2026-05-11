import { Module } from '@nestjs/common';
import { CandidateModule } from '../candidate/candidate.module';
import { DatabaseModule } from '../database/database.module';
import { ResumeModule } from '../resume/resume.module';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';

@Module({
  imports: [DatabaseModule, CandidateModule, ResumeModule],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
