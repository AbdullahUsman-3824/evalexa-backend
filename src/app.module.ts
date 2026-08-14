import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ApplicationModule } from './modules/application/application.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CompanyModule } from './modules/company/company.module';
import { CandidateModule } from './modules/candidate/candidate.module';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { FASTAPI_BASE_URL } from './common/constants/fastapi.constants';
import { PublicModule } from './modules/public/public.module';
import { ResumeModule } from './modules/resume/resume.module';
import { ScreeningModule } from './modules/screening/screening.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { SkillsModule } from './modules/skills/skills.module';
import { RankingModule } from './modules/ranking/ranking.module';
import { ProcessingModule } from './modules/processing/processing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    HttpModule.register({
      global: true,
      baseURL: FASTAPI_BASE_URL,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        const useTls = !!url?.startsWith('rediss://');
        return {
          connection: {
            url,
            ...(useTls ? { tls: {} } : {}),
          },
        };
      },
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
    SkillsModule,
    RankingModule,
    ProcessingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
