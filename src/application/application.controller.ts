import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { ApplicationService } from './application.service';

@Controller('application')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post('apply')
  applyWithParsedData(@Body() dto: ApplyWithParsedDto) {
    return this.applicationService.applyWithParsedData(dto);
  }

  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  @Get('job/:jobId')
  findAllByJob(@User() user: JwtPayload, @Param('jobId') jobId: string) {
    return this.applicationService.findAllByJob(user.companyId, jobId);
  }
}
