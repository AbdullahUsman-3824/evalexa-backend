import type { Express } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  @UseInterceptors(
    FileInterceptor('resumeFile', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        if (allowed.includes(file.mimetype)) {
          cb(null, true);
          return;
        }

        cb(
          new BadRequestException('Only PDF, DOC, and DOCX files are allowed'),
          false,
        );
      },
    }),
  )
  apply(
    @Param('jobSlug') jobSlug: string,
    @Body() dto: PublicJobApplicationDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.publicJobsService.applyToJob(jobSlug, dto, file);
  }
}
