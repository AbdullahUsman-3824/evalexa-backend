import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CandidateController } from './candidate.controller';
import { CandidateService } from './candidate.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CandidateController],
  providers: [CandidateService],
})
export class CandidateModule {}
