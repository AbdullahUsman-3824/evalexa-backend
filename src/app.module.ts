import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationModule } from './application/application.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompanyModule } from './company/company.module';
import { CandidateModule } from './candidate/candidate.module';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './jobs/jobs.module';
import { ResumeModule } from './resume/resume.module';
import { ScreeningModule } from './screening/screening.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    CompanyModule,
    DatabaseModule,
    JobsModule,
    UsersModule,
    AuthModule,
    CandidateModule,
    ResumeModule,
    ApplicationModule,
    ScreeningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
