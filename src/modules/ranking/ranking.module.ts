import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FASTAPI_BASE_URL } from '../../common/constants/fastapi.constants';
import { RankingService } from './ranking.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    HttpModule.register({
      baseURL: FASTAPI_BASE_URL,
    }),
    DatabaseModule,
  ],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
