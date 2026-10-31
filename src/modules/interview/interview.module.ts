import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { DatabaseModule } from '../../database/database.module';
import { InterviewService } from './interview.service';
import { InterviewController } from './interview.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [InterviewController],
  providers: [InterviewService, RecruiterRoleGuard],
})
export class InterviewModule {}
