import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { FASTAPI_ENDPOINTS } from '../constants/fastapi.constants';

export interface ResumeBasics {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  headline: string;
  summary: string;
}

export interface ResumeSkill {
  name: string;
  category: string;
}

export interface ResumeEducation {
  degree: string;
  field: string;
  institution: string;
  startDate: string;
  endDate: string;
  grade: string;
}

export interface ResumeExperience {
  title?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

export interface ResumeProject {
  name: string;
  description: string;
  technologies: string[];
  url: string;
}

export interface ResumeMeta {
  totalExperienceMonths: number;
  parserVersion: string;
  confidenceScore: number;
}

export interface ParsedResumeData {
  basics: ResumeBasics;
  skills: ResumeSkill[];
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  certifications: string[];
  interests: string[];
  meta: ResumeMeta;
}

interface ResumeParserResponse {
  data: ParsedResumeData;
}

function isParsedResumeData(value: unknown): value is ParsedResumeData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ParsedResumeData>;
  return typeof candidate.basics === 'object' && candidate.basics !== null;
}

@Injectable()
export class ResumeParserService {
  constructor(private readonly httpService: HttpService) {}

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
  ): Promise<ParsedResumeData>;
  async parseResume(input: Buffer, fileName: string): Promise<ParsedResumeData>;
  async parseResume(
    input: string | Buffer,
    fileName?: string,
  ): Promise<ParsedResumeData> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<ResumeParserResponse>(
          FASTAPI_ENDPOINTS.RESUME.PARSE,
          this.buildRequestBody(input, fileName),
          this.buildRequestConfig(input, fileName),
        ),
      );

      const parsed = response.data?.data;

      if (!isParsedResumeData(parsed)) {
        throw new BadRequestException('Invalid parser response');
      }

      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to parse resume: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
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
