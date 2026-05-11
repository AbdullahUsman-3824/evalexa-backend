import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationSource,
  ApplicationStatus,
  ScreeningStage,
} from '@prisma/client';
import { CandidateService } from '../candidate/candidate.service';
import { DatabaseService } from '../database/database.service';
import { ResumeService } from '../resume/resume.service';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';

@Injectable()
export class ApplicationService {
  constructor(
    private readonly candidateService: CandidateService,
    private readonly resumeService: ResumeService,
    private readonly db: DatabaseService,
  ) {}

  private normalizeText(value?: string | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeEmail(value?: string): string | undefined {
    const normalized = this.normalizeText(value);
    return normalized ? normalized.toLowerCase() : undefined;
  }

  private buildFullName(firstName: string, lastName: string): string {
    return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim();
  }

  private safeUpdate<T extends object>(data: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }

  private mapEducationToResumeField(
    education: ApplyWithParsedDto['education'],
  ): string | null {
    const first = education[0];

    if (!first) {
      return null;
    }

    const parts = [
      this.normalizeText(first.degree),
      this.normalizeText(first.fieldOfStudy),
      this.normalizeText(first.school),
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(', ') : null;
  }

  private parseDate(dateText?: string): Date | null {
    const normalized = this.normalizeText(dateText);

    if (!normalized) {
      return null;
    }

    const parsedDate = new Date(normalized);

    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate;
  }

  private calculateExperienceMonths(
    experience: ApplyWithParsedDto['experience'],
  ): number | null {
    if (!Array.isArray(experience) || experience.length === 0) {
      return null;
    }

    const now = new Date();
    let totalMonths = 0;

    for (const item of experience) {
      const start = this.parseDate(item.startDate);

      if (!start) {
        continue;
      }

      const end = item.isCurrent ? now : (this.parseDate(item.endDate) ?? now);

      if (end < start) {
        continue;
      }

      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

      totalMonths += Math.max(months, 0);
    }

    return totalMonths > 0 ? totalMonths : null;
  }

  private buildParsedData(dto: ApplyWithParsedDto): object {
    return {
      personal: dto.personal,
      education: dto.education,
      experience: dto.experience,
    };
  }

  private async resolveCandidate(dto: ApplyWithParsedDto) {
    const fullName = this.buildFullName(
      dto.personal.firstName,
      dto.personal.lastName,
    );

    const safeFullName = fullName || 'Unknown';
    const email = this.normalizeEmail(dto.personal.email);

    const patch = this.safeUpdate({
      fullName: safeFullName,
      email,
      phone: this.normalizeText(dto.personal.phone),
      location: this.normalizeText(dto.personal.address),
    });

    if (dto.candidateId) {
      const existing = await this.candidateService.findById(dto.candidateId);

      if (!existing) {
        throw new NotFoundException(
          `Candidate with id ${dto.candidateId} not found`,
        );
      }

      return this.candidateService.updateCandidate(dto.candidateId, patch);
    }

    if (email) {
      const existingByEmail = await this.candidateService.findByEmail(email);

      if (existingByEmail) {
        return existingByEmail;
      }
    }

    return this.candidateService.createCandidate(
      patch as {
        fullName: string;
        email?: string;
        phone?: string;
        location?: string;
      },
    );
  }

  private async resolveResume(dto: ApplyWithParsedDto, candidateId: string) {
    const extractedEducation = this.mapEducationToResumeField(dto.education);
    const extractedExperience = this.calculateExperienceMonths(dto.experience);
    const parsedData = this.buildParsedData(dto);

    if (dto.resumeId) {
      const existingResume = await this.resumeService.findById(dto.resumeId);

      if (!existingResume) {
        throw new NotFoundException(`Resume with id ${dto.resumeId} not found`);
      }

      return this.resumeService.updateResume(
        dto.resumeId,
        this.safeUpdate({
          candidateId,
          resumeUrl: this.normalizeText(dto.resumeUrl),
          parsedData,
          extractedEducation,
          extractedExperience,
        }),
      );
    }

    const resumeUrl = this.normalizeText(dto.resumeUrl);

    if (!resumeUrl) {
      throw new BadRequestException(
        'resumeUrl is required when creating a new resume',
      );
    }

    return this.resumeService.createResume({
      candidateId,
      resumeUrl,
      parsedData,
      extractedEducation,
      extractedExperience,
    });
  }

  private async ensureJobAndCompanyExist(jobId: string, companyId: string) {
    const [job, company] = await Promise.all([
      this.db.job.findUnique({ where: { id: jobId }, select: { id: true } }),
      this.db.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      }),
    ]);

    if (!job) {
      throw new NotFoundException(`Job with id ${jobId} not found`);
    }

    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }
  }

  async findByCandidateAndJob(candidateId: string, jobId: string) {
    return this.db.application.findFirst({
      where: {
        candidateId,
        jobId,
      },
      select: {
        id: true,
        status: true,
        appliedAt: true,
      },
    });
  }

  async applyWithParsedData(dto: ApplyWithParsedDto) {
    await this.ensureJobAndCompanyExist(dto.jobId, dto.companyId);

    const candidate = await this.resolveCandidate(dto);
    const resume = await this.resolveResume(dto, candidate.id);

    const existingApplication = await this.findByCandidateAndJob(
      candidate.id,
      dto.jobId,
    );

    if (existingApplication) {
      throw new ConflictException('Application already exists for this job');
    }

    const application = await this.db.application.create({
      data: {
        candidateId: candidate.id,
        jobId: dto.jobId,
        companyId: dto.companyId,
        resumeId: resume.id,
        status: ApplicationStatus.APPLIED,
        screeningStage: ScreeningStage.NOT_STARTED,
        source: ApplicationSource.FORM_FILL,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      applicationId: application.id,
      candidateId: candidate.id,
      resumeId: resume.id,
      status: application.status,
    };
  }
}
