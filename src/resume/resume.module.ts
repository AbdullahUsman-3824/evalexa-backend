import { Module } from '@nestjs/common';
import { CandidateModule } from '../candidate/candidate.module';
import { DatabaseModule } from '../database/database.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { ResumeParserService } from './resume-parser.service';

@Module({
  imports: [DatabaseModule, CandidateModule],
  controllers: [ResumeController],
  providers: [ResumeService, ResumeParserService],
  exports: [ResumeService],
})
export class ResumeModule {}
