import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
