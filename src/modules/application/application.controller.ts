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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Express } from 'express';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { ApplicationService } from './application.service';

const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Controller('application')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

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

  @UseGuards(JwtAuthGuard, RecruiterRoleGuard)
  @Get('job/:jobId')
  findAllByJob(@User() user: JwtPayload, @Param('jobId') jobId: string) {
    return this.applicationService.findAllByJob(user.companyId, jobId);
  }
}
