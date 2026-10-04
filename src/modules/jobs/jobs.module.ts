import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ProcessingModule } from '../processing/processing.module';
import { ShortlistingService } from '../application/shortlisting.service';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, ProcessingModule],
  controllers: [JobsController],
  providers: [JobsService, RecruiterRoleGuard, ShortlistingService],
  exports: [JobsService],
})
export class JobsModule {}
