import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Express } from 'express';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { FindJobApplicationsQueryDto } from './dto/find-job-applications-query.dto';
import { ApplicationService } from './application.service';
import { ShortlistTopDto } from './dto/shortlist-top.dto';
import { UnshortlistDto } from './dto/unshortlist.dto';
import { ShortlistingService } from './shortlisting.service';

const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Controller('application')
export class ApplicationController {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly shortlistingService: ShortlistingService,
  ) {}

  // GET application/:id
  @Get(':id')
  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  getApplication(@User() user: JwtPayload, @Param('id') applicationId: string) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    return this.applicationService.getApplication(
      user.companyId,
      applicationId,
    );
  }

  // Apply with parsed data and a resume file
  // POST /application/apply
  @Post('apply')
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

    const dto = plainToInstance(ApplyWithParsedDto, parsedBody);
    const errors = await validate(dto);

    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})),
      );
    }

    return this.applicationService.applyWithParsedData(dto, file);
  }

  // Get all applications for a job
  // GET /application/jobs/:jobId
  @Get('jobs/:jobId')
  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  findAllByJob(
    @User() user: JwtPayload,
    @Param('jobId') jobId: string,
    @Query() query: FindJobApplicationsQueryDto,
  ) {
    return this.applicationService.findAllByJob(user.companyId, jobId, query);
  }

  // Upload multiple resumes for a job (bulk import)
  // POST /application/job/:jobId/bulk
  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  @Post('job/:jobId/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FilesInterceptor('files', 100, {
      limits: { fileSize: 10 * 1024 * 1024 },
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
  async bulkImport(
    @User() user: JwtPayload,
    @Param('jobId') jobId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    return this.applicationService.bulkImportResumes(
      jobId,
      user.companyId,
      files,
    );
  }

  // Shortlisting
  // POST /application/jobs/:jobId/shortlist-top
  @Post('jobs/:jobId/shortlist-top')
  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  @HttpCode(HttpStatus.OK)
  shortlistTop(
    @User() user: JwtPayload,
    @Param('jobId') jobId: string,
    @Body() dto: ShortlistTopDto,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    return this.shortlistingService.shortlistTopN(jobId, dto.count, {
      auto: false,
      actorUserId: user.sub,
    });
  }

  // POST /application/:id/shortlist
  @Post(':id/shortlist')
  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  shortlistOne(@User() user: JwtPayload, @Param('id') id: string) {
    return this.shortlistingService.shortlistOne(id, user.companyId!, {
      auto: false,
      actorUserId: user.sub,
    });
  }

  // POST /application/:id/unshortlist
  @Post(':id/unshortlist')
  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  unshortlist(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UnshortlistDto,
  ) {
    return this.shortlistingService.unshortlistOne(id, user.companyId!, {
      actorUserId: user.sub,
      reason: dto.reason,
    });
  }
}
