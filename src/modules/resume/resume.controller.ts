import type { Express } from 'express';
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResumeService } from './resume.service';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const RESUME_FILE_INTERCEPTOR_OPTIONS = {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException('Only PDF, DOC, and DOCX files are allowed'),
        false,
      );
    }
  },
};

@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', RESUME_FILE_INTERCEPTOR_OPTIONS))
  async parseResume(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.resumeService.parseResumePreview(file);
  }
}
