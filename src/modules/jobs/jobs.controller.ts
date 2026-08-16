import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsQueryDto } from './dto/find-jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';

@UseGuards(JwtAuthGuard, RecruiterRoleGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // Create a new job posting
  @Post()
  create(@User() user: JwtPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.sub, user.companyId, dto);
  }

  // Get a list of all job postings
  @Get()
  findAll(@User() user: JwtPayload, @Query() query: FindJobsQueryDto) {
    return this.jobsService.findAll(user.sub, user.companyId, query);
  }

  // Get only job titles for the dropdowns like stuff
  @Get('titles')
  findTitles(@User() user: JwtPayload) {
    return this.jobsService.findTitles(user.sub, user.companyId);
  }

  // Get summary of a single job posting by ID
  @Get(':id/summary')
  async getSummary(@User() user: JwtPayload, @Param('id') id: string) {
    return this.jobsService.getSummary(user.sub, user.companyId, id);
  }

  // Get a single job posting by ID
  @Get(':id')
  findOne(@User() user: JwtPayload, @Param('id') id: string) {
    return this.jobsService.findOne(user.sub, user.companyId, id);
  }

  @Patch(':id')
  update(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.update(user.sub, user.companyId, id, dto);
  }
}
