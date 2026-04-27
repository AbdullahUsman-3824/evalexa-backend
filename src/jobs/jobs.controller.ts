import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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

  @Post()
  create(@User() user: JwtPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.sub, user.companyId, dto);
  }

  @Get()
  findAll(@User() user: JwtPayload, @Query() query: FindJobsQueryDto) {
    return this.jobsService.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@User() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.jobsService.findOne(user.companyId, id);
  }

  @Patch(':id')
  update(
    @User() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.update(user.sub, user.companyId, id, dto);
  }
}
