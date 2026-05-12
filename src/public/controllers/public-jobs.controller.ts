import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PublicJobApplicationDto } from '../dto/public-job-application.dto';
import { PublicJobsQueryDto } from '../dto/public-jobs-query.dto';
import { PublicJobsService } from '../services/public-jobs.service';

@Controller('public/jobs')
export class PublicJobsController {
  constructor(private readonly publicJobsService: PublicJobsService) {}

  @Get()
  findAll(@Query() query: PublicJobsQueryDto) {
    return this.publicJobsService.findAll(query);
  }

  @Get('featured')
  findFeatured() {
    return this.publicJobsService.findFeatured();
  }

  @Get(':jobSlug/similar')
  findSimilar(@Param('jobSlug') jobSlug: string) {
    return this.publicJobsService.findSimilar(jobSlug);
  }

  @Get(':jobSlug')
  findOne(@Param('jobSlug') jobSlug: string) {
    return this.publicJobsService.findOne(jobSlug);
  }

  @Post(':jobSlug/apply')
  @HttpCode(HttpStatus.CREATED)
  applyWithParsedData(
    @Param('jobSlug') jobSlug: string,
    @Body() dto: PublicJobApplicationDto,
  ) {
    return this.publicJobsService.applyToJobWithParsedData(jobSlug, dto as any);
  }
}
