import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CandidateModule } from '../candidate/candidate.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { DatabaseModule } from '../../database/database.module';
import { ResumeModule } from '../resume/resume.module';
import { UsersModule } from '../users/users.module';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { RankingModule } from '../ranking/ranking.module';
import { ProcessingModule } from '../processing/processing.module';

@Module({
  imports: [
    DatabaseModule,
    CandidateModule,
    ResumeModule,
    UsersModule,
    AuthModule,
    RankingModule,
    ProcessingModule,
  ],
  controllers: [ApplicationController],
  providers: [ApplicationService, RecruiterRoleGuard],
  exports: [ApplicationService],
})
export class ApplicationModule {}
