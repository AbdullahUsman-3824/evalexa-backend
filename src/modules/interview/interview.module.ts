import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { DatabaseModule } from '../../database/database.module';
import { InterviewService } from './services/interview.service';
import { PublicInterviewService } from './services/public-interview.service';
import { InterviewController } from './controllers/interview.controller';
import { PublicInterviewController } from './controllers/public-interview.controller';
import { InterviewSessionController } from './controllers/interview-session.controller';
import { InterviewSessionGuard } from './guards/interview-session.guard';
import { UsersModule } from '../users/users.module';

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
  ],
  controllers: [
    InterviewController,
    PublicInterviewController,
    InterviewSessionController,
  ],
  providers: [
    InterviewService,
    PublicInterviewService,
    RecruiterRoleGuard,
    InterviewSessionGuard,
    // Apply ThrottlerGuard to all routes in this module.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [InterviewService, InterviewSessionGuard],
})
export class InterviewModule {}
