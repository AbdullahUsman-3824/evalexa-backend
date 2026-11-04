import { Module } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
