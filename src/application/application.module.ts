import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CandidateModule } from '../candidate/candidate.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { DatabaseModule } from '../database/database.module';
import { ResumeModule } from '../resume/resume.module';
import { UsersModule } from '../users/users.module';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';

@Module({
  imports: [
    DatabaseModule,
    CandidateModule,
    ResumeModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [ApplicationController],
  providers: [ApplicationService, RecruiterRoleGuard],
  exports: [ApplicationService],
})
export class ApplicationModule {}
