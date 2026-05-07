import type { Express } from 'express';
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadResumeParamsDto } from './dto/upload-resume.params.dto';
import { UploadResumeQueryDto } from './dto/upload-resume.query.dto';
import { ResumeService } from './resume.service';

@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  /**
   * POST /resume/upload
   * POST /resume/upload?candidateId=<uuid>   (optional: attach to existing candidate)
   *
   * Multipart body field: "file" (PDF / DOC / DOCX)
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
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
  async uploadResume(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: UploadResumeQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.resumeService.uploadAndProcess(file, query.candidateId);
  }

  /**
   * POST /resume/upload/:candidateId
   * Convenience route — attach resume directly to a known candidate.
   */
  @Post('upload/:candidateId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
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
  async uploadResumeForCandidate(
    @Param() params: UploadResumeParamsDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.resumeService.uploadAndProcess(file, params.candidateId);
  }
}
