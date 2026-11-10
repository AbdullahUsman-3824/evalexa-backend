import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { DatabaseModule } from '../../database/database.module';
import { InterviewService } from './services/interview.service';
import { InterviewQuestionService } from './services/interview-question.service';
import { PublicInterviewService } from './services/public-interview.service';
import { InterviewController } from './controllers/interview.controller';
import { PublicInterviewController } from './controllers/public-interview.controller';
import { InterviewSessionController } from './controllers/interview-session.controller';
import { InterviewSessionGuard } from './guards/interview-session.guard';
import { UsersModule } from '../users/users.module';
import { ProcessingModule } from '../processing/processing.module';
import { InterviewTranscriptionService } from './services/interview-transcription.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    // Rate limiting for public OTP endpoints.
    // Default: 20 req/min per IP — individual endpoints override this via @Throttle().
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 20,
      },
    ]),
    ProcessingModule,
  ],
  controllers: [
    InterviewController,
    PublicInterviewController,
    InterviewSessionController,
  ],
  providers: [
    InterviewService,
    InterviewQuestionService,
    PublicInterviewService,
    InterviewTranscriptionService,
    RecruiterRoleGuard,
    InterviewSessionGuard,
    // Apply ThrottlerGuard to all routes in this module.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [InterviewService, InterviewQuestionService, InterviewSessionGuard],
})
export class InterviewModule {}
