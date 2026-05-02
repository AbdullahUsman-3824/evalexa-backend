import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateSource, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class CandidateService {
  constructor(private readonly db: DatabaseService) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeSource(
    source?: CreateCandidateDto['source'],
  ): CandidateSource {
    switch (source) {
      case 'bulk_upload':
        return CandidateSource.BULK_UPLOAD;
      case 'manual_entry':
        return CandidateSource.MANUAL_ENTRY;
      case 'job_page':
      default:
        return CandidateSource.JOB_PAGE;
    }
  }

  private hasPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === code
    );
  }

  private readonly candidatePublicSelect = {
    id: true,
    fullName: true,
    email: true,
    phone: true,
    linkedinUrl: true,
    portfolioUrl: true,
    location: true,
    source: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.CandidateSelect;

  private readonly candidateProfileSelect = {
    ...this.candidatePublicSelect,
    _count: {
      select: {
        resumes: true,
        applications: true,
      },
    },
  } satisfies Prisma.CandidateSelect;

  async createCandidate(dto: CreateCandidateDto) {
    const email = dto.email ? this.normalizeEmail(dto.email) : undefined;
    const existingCandidate = await this.findByEmail(email);

    if (existingCandidate) {
      return existingCandidate;
    }

    return this.db.candidate.create({
      data: {
        ...dto,
        ...(email ? { email } : {}),
        source: this.normalizeSource(dto.source),
      },
      select: this.candidatePublicSelect,
    });
  }

  async findByEmail(email?: string | null) {
    if (!email) {
      return null;
    }

    return this.db.candidate.findFirst({
      where: { email: this.normalizeEmail(email) },
      select: this.candidatePublicSelect,
    });
  }

  async getCandidateProfile(id: string) {
    const candidate = await this.db.candidate.findUnique({
      where: { id },
      select: this.candidateProfileSelect,
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with id ${id} not found`);
    }

    return candidate;
  }

  async updateCandidate(id: string, dto: UpdateCandidateDto) {
    const candidate = await this.db.candidate.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with id ${id} not found`);
    }

    const email = dto.email ? this.normalizeEmail(dto.email) : undefined;
    const { source, ...rest } = dto;

    try {
      return await this.db.candidate.update({
        where: { id },
        data: {
          ...rest,
          ...(email ? { email } : {}),
          ...(source ? { source: this.normalizeSource(source) } : {}),
        },
        select: this.candidatePublicSelect,
      });
    } catch (error: unknown) {
      if (this.hasPrismaErrorCode(error, 'P2025')) {
        throw new NotFoundException(`Candidate with id ${id} not found`);
      }

      throw error;
    }
  }
}
