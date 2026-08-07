import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { RecruiterRoleGuard } from './guards/recruiter-role.guard';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule],
  controllers: [CompanyController],
  providers: [CompanyService, RecruiterRoleGuard],
  exports: [CompanyService],
})
export class CompanyModule {}
