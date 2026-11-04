import { BadRequestException, Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { FastApiService } from '../../common/fastapi/fastapi.service';
import { ResumeData } from '../../common/fastapi/contracts';

function isParsedResumeData(value: unknown): value is ResumeData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ResumeData>;
  return typeof candidate.basics === 'object' && candidate.basics !== null;
}

@Injectable()
export class ResumeParserService {
  constructor(private readonly fastApi: FastApiService) {}

  private getMimeType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async parseResume(
    input: string,
    fileName?: string,
  ): Promise<ResumeData>;
  async parseResume(input: Buffer, fileName: string): Promise<ResumeData>;
  async parseResume(
    input: string | Buffer,
    fileName?: string,
  ): Promise<ResumeData> {
    if (typeof input === 'string') {
      // Fetch file from URL → buffer, then re-enter as Buffer path
      const fileData = await this.fastApi.get<ArrayBuffer>(input, {
        responseType: 'arraybuffer',
        // absolute URL bypasses FastAPI baseURL
      });
      const buffer = Buffer.from(fileData);
      const derivedFileName =
        fileName || input.split('/').pop() || 'resume.pdf';
      return this.parseResume(buffer, derivedFileName);
    }

    if (!fileName) {
      throw new BadRequestException('File name is required');
    }
    if (input.length === 0) {
      throw new BadRequestException('Resume file is required');
    }

    const form = new FormData();
    form.append('file', input, {
      filename: fileName,
      contentType: this.getMimeType(fileName),
    });

    const response = await this.fastApi.parseResume(form);

    const parsed = response?.data;

    if (!isParsedResumeData(parsed)) {
      throw new BadRequestException('Invalid parser response');
    }

    return parsed;
  }

  private buildRequestBody(
    input: string | Buffer,
    fileName?: string,
  ): FormData | Record<string, string> {
    if (typeof input === 'string') {
      return {
        fileUrl: input,
        file_url: input,
        url: input,
      };
    }

    if (!fileName) {
      throw new BadRequestException('File name is required');
    }

    if (input.length === 0) {
      throw new BadRequestException('Resume file is required');
    }

    const mimeType = this.getMimeType(fileName);
    const formData = new FormData();
    // form-data package accepts a Buffer with filename and contentType
    formData.append('file', input, {
      filename: fileName,
      contentType: mimeType,
    });
    return formData;
  }

  private buildRequestConfig(input: string | Buffer, fileName?: string) {
    if (typeof input === 'string') {
      return {};
    }

    if (!fileName) {
      throw new BadRequestException('File name is required');
    }

    // When using the form-data package we must forward its headers (including boundary)
    const formData = this.buildRequestBody(input, fileName) as FormData;
    return { headers: formData.getHeaders() };
  }
}
