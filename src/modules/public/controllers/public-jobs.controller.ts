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
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Express } from 'express';
import { PublicJobApplicationDto } from '../dto/public-job-application.dto';
import { PublicJobsQueryDto } from '../dto/public-jobs-query.dto';
import { PublicJobsService } from '../services/public-jobs.service';

const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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

  /**
   * POST /public/jobs/:jobSlug/apply
   *
   * Multipart request:
   *   - field "file": the resume (PDF/DOC/DOCX), required
   *   - field "data": JSON string matching PublicJobApplicationDto
   *
   * jobId/companyId are intentionally NOT part of PublicJobApplicationDto
   * and are never read from the client — PublicJobsService resolves them
   * itself from jobSlug via a trusted DB lookup. This is the only public
   * apply endpoint; it does not accept a client-asserted job/company.
   */
  @Post(':jobSlug/apply')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_RESUME_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only PDF, DOC, and DOCX files are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async applyWithParsedData(
    @Param('jobSlug') jobSlug: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('data') rawData: string,
  ) {
    if (!file) {
      throw new BadRequestException('Resume file is required');
    }

    if (!rawData) {
      throw new BadRequestException('Missing application data');
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawData);
    } catch {
      throw new BadRequestException('Invalid JSON in "data" field');
    }

    const dto = plainToInstance(PublicJobApplicationDto, parsedBody);
    const errors = await validate(dto);

    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})),
      );
    }
    return this.publicJobsService.applyToJobWithParsedData(jobSlug, dto, file);
  }
}
