import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CandidateModule } from '../candidate/candidate.module';
import { DatabaseModule } from '../database/database.module';
import { FASTAPI_BASE_URL } from '../constants/fastapi.constants';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { ResumeParserService } from './resume-parser.service';

@Module({
  imports: [
    HttpModule.register({
      baseURL: FASTAPI_BASE_URL,
    }),
    DatabaseModule,
    CandidateModule,
  ],
  controllers: [ResumeController],
  providers: [ResumeService, ResumeParserService],
  exports: [ResumeService],
})
export class ResumeModule {}
