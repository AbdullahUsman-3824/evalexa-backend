import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ScreeningService } from './screening.service';

@Module({
  providers: [ScreeningService, ScoringService],
  exports: [ScreeningService, ScoringService],
})
export class ScreeningModule {}
