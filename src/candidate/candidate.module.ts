import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CandidateController } from './candidate.controller';
import { CandidateService } from './candidate.service';
import { UsersModule } from '../users/users.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule],
  controllers: [CandidateController],
  providers: [CandidateService, RecruiterRoleGuard],
  exports: [CandidateService],
})
export class CandidateModule {}
