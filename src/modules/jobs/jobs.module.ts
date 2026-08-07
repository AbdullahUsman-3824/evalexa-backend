import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule],
  controllers: [JobsController],
  providers: [JobsService, RecruiterRoleGuard],
  exports: [JobsService],
})
export class JobsModule {}
