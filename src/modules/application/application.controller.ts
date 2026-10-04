import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Express } from 'express';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { ApplicationService } from './application.service';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { BulkShortlistDto } from './dto/bulk-shortlist.dto';
import { FindJobApplicationsQueryDto } from './dto/find-job-applications-query.dto';
import { ShortlistListQueryDto } from './dto/shortlist-list-query.dto';
import { ShortlistTopDto } from './dto/shortlist-top.dto';
import { ShortlistingService } from './shortlisting.service';

const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const RESUME_FILE_FILTER = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (ALLOWED_RESUME_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException('Only PDF, DOC, and DOCX files are allowed'),
      false,
    );
  }
};

@Controller('application')
@UseGuards(JwtAuthGuard, RecruiterRoleGuard)
export class ApplicationController {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly shortlistingService: ShortlistingService,
  ) {}

  // ─── Application ────────────────────────────────────────────────────

  // GET /application/jobs/:jobId
  @Get('jobs/:jobId')
  findAllByJob(
    @User() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: FindJobApplicationsQueryDto,
  ) {
    return this.applicationService.findAllByJob(
      this.requireCompanyId(user),
      jobId,
      query,
    );
  }

  // GET /application/jobs/:jobId/shortlisted
  @Get('jobs/:jobId/shortlisted')
  getShortlisted(
    @User() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ShortlistListQueryDto,
  ) {
    return this.applicationService.getShortlisted(
      this.requireCompanyId(user),
      jobId,
      query,
    );
  }

  // GET /application/jobs/:jobId/rejected
  @Get('jobs/:jobId/rejected')
  getRejected(
    @User() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ShortlistListQueryDto,
  ) {
    return this.applicationService.getRejected(
      this.requireCompanyId(user),
      jobId,
      query,
    );
  }

  // GET /application/:id
  @Get(':id')
  getApplication(
    @User() user: JwtPayload,
    @Param('id', ParseUUIDPipe) applicationId: string,
  ) {
    return this.applicationService.getApplication(
      this.requireCompanyId(user),
      applicationId,
    );
  }

  // POST /application/apply
  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: RESUME_FILE_FILTER,
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

  // POST /application/jobs/:jobId/bulk
  @Post('jobs/:jobId/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FilesInterceptor('files', 100, {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: RESUME_FILE_FILTER,
    }),
  )
  bulkImport(
    @User() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    return this.applicationService.bulkImportResumes(
      jobId,
      this.requireCompanyId(user),
      files,
    );
  }

  // ─── Shortlist ──────────────────────────────────────────────────────

  // POST /application/jobs/:jobId/shortlist-top
  @Post('jobs/:jobId/shortlist-top')
  @HttpCode(HttpStatus.OK)
  shortlistTop(
    @User() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: ShortlistTopDto,
  ) {
    const companyId = this.requireCompanyId(user);
    return this.shortlistingService.shortlistTopN(jobId, dto.count, {
      auto: false,
      companyId,
    });
  }

  // POST /application/jobs/:jobId/bulk-shortlist
  @Post('jobs/:jobId/bulk-shortlist')
  @HttpCode(HttpStatus.OK)
  bulkShortlist(
    @User() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: BulkShortlistDto,
  ) {
    return this.shortlistingService.bulkShortlist(
      jobId,
      dto.applicationIds,
      this.requireCompanyId(user),
    );
  }

  // POST /application/:id/shortlist
  @Post(':id/shortlist')
  @HttpCode(HttpStatus.OK)
  shortlistOne(
    @User() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shortlistingService.shortlistOne(
      id,
      this.requireCompanyId(user),
    );
  }

  // POST /application/:id/unshortlist
  @Post(':id/unshortlist')
  @HttpCode(HttpStatus.OK)
  unshortlistOne(
    @User() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shortlistingService.unshortlistOne(
      id,
      this.requireCompanyId(user),
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private requireCompanyId(user: JwtPayload): string {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    return user.companyId;
  }
}
