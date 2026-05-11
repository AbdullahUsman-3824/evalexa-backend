import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ApplicationModule } from './application/application.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompanyModule } from './company/company.module';
import { CandidateModule } from './candidate/candidate.module';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './jobs/jobs.module';
import { PublicModule } from './public/public.module';
import { ResumeModule } from './resume/resume.module';
import { ScreeningModule } from './screening/screening.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

const fastApiBaseUrl = `${(process.env.FASTAPI_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')}/api/v1`;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    HttpModule.register({
      global: true,
      baseURL: fastApiBaseUrl,
    }),
    CompanyModule,
    DatabaseModule,
    JobsModule,
    UsersModule,
    AuthModule,
    CandidateModule,
    ResumeModule,
    ApplicationModule,
    PublicModule,
    ScreeningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
