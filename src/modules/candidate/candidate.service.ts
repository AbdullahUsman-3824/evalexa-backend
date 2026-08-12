import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { normalizeEmail } from '../../common/helpers/normalizer';
import {
  candidatePublicSelect,
  candidateProfileSelect,
  candidateRecruiterSelect,
} from './candidate.select';

type Db = DatabaseService | Prisma.TransactionClient;

@Injectable()
export class CandidateService {
  constructor(private readonly db: DatabaseService) {}

  private hasPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === code
    );
  }

  /**
   * Find by email → update if exists, otherwise create.
   * All candidate upsert logic lives here.
   */
  async upsertByEmail(
    data: {
      fullName: string;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
    },
    db: Db = this.db,
  ) {
    const email = data.email ? normalizeEmail(data.email) : undefined;

    const existing = await this.findByEmail(email, db);

    if (existing) {
      return this.updateCandidate(
        existing.id,
        {
          fullName: data.fullName,
          email,
          phone: data.phone ?? undefined,
          location: data.location ?? undefined,
        },
        db,
      );
    }

    return this.createCandidate(
      {
        fullName: data.fullName,
        email,
        phone: data.phone ?? undefined,
        location: data.location ?? undefined,
      },
      db,
    );
  }

  async createCandidate(dto: CreateCandidateDto, db: Db = this.db) {
    const email = dto.email ? normalizeEmail(dto.email) : undefined;
    const existingCandidate = await this.findByEmail(email, db);

    if (existingCandidate) {
      return existingCandidate;
    }

    return db.candidate.create({
      data: {
        ...dto,
        ...(email ? { email } : {}),
      },
      select: candidatePublicSelect,
    });
  }

  findByEmail(email: string | undefined | null, db: Db = this.db) {
    if (!email) {
      return null;
    }

    return db.candidate.findFirst({
      where: { email: normalizeEmail(email) },
      select: candidatePublicSelect,
    });
  }

  findById(id: string, db: Db = this.db) {
    return db.candidate.findUnique({
      where: { id },
      select: candidatePublicSelect,
    });
  }

  async getCandidateProfile(id: string) {
    const candidate = await this.db.candidate.findUnique({
      where: { id },
      select: candidateProfileSelect,
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with id ${id} not found`);
    }

    return candidate;
  }

  async getCandidateRecruiterView(id: string) {
    const candidate = await this.db.candidate.findUnique({
      where: { id },
      select: candidateRecruiterSelect,
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with id ${id} not found`);
    }

    return candidate;
  }

  findAllRecruiterView() {
    return this.db.candidate.findMany({
      orderBy: { createdAt: 'desc' },
      select: candidateRecruiterSelect,
    });
  }

  async updateCandidate(id: string, dto: UpdateCandidateDto, db: Db = this.db) {
    const candidate = await db.candidate.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with id ${id} not found`);
    }

    const email = dto.email ? normalizeEmail(dto.email) : undefined;
    const rest = dto;

    try {
      return await db.candidate.update({
        where: { id },
        data: {
          ...rest,
          ...(email ? { email } : {}),
        },
        select: candidatePublicSelect,
      });
    } catch (error: unknown) {
      if (this.hasPrismaErrorCode(error, 'P2025')) {
        throw new NotFoundException(`Candidate with id ${id} not found`);
      }

      throw error;
    }
  }
}
