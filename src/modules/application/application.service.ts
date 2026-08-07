import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationSource, ApplicationStatus } from '@prisma/client';
import { jobApplicationsSelect } from './application.select';
import { isUUID } from 'class-validator';
import { CandidateService } from '../candidate/candidate.service';
import { DatabaseService } from '../../database/database.service';
import { ResumeService } from '../resume/resume.service';
import { UploadedResumeFileDto } from '../resume/dto/uploaded-resume-file.dto';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { RankingService } from '../ranking/ranking.service';

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    private readonly candidateService: CandidateService,
    private readonly resumeService: ResumeService,
    private readonly db: DatabaseService,
    private readonly rankingService: RankingService,
  ) {}

  private normalizeText(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined;
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
    if (!first) return null;

    const parts = [
      this.normalizeText(first.degree),
      this.normalizeText(first.fieldOfStudy),
      this.normalizeText(first.school),
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(', ') : null;
  }

  private parseDate(dateText?: string): Date | null {
    const normalized = this.normalizeText(dateText);
    if (!normalized) return null;

    const parsedDate = new Date(normalized);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private calculateExperienceMonths(
    experience: ApplyWithParsedDto['experience'],
  ): number | null {
    if (!Array.isArray(experience) || experience.length === 0) return null;

    const now = new Date();
    let totalMonths = 0;

    for (const item of experience) {
      const start = this.parseDate(item.startDate);
      if (!start) continue;

      const end = item.isCurrent ? now : (this.parseDate(item.endDate) ?? now);
      if (end < start) continue;

      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

      totalMonths += Math.max(months, 0);
    }

    return totalMonths > 0 ? totalMonths : null;
  }

  private async ensureJobAndCompanyExist(jobId: string, companyId: string) {
    const [job, company] = await Promise.all([
      this.db.job.findUnique({ where: { id: jobId }, select: { id: true } }),
      this.db.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      }),
    ]);

    if (!job) throw new NotFoundException(`Job with id ${jobId} not found`);
    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }
  }

  async findByCandidateAndJob(candidateId: string, jobId: string) {
    return this.db.application.findFirst({
      where: { candidateId, jobId },
      select: { id: true, status: true, appliedAt: true },
    });
  }

  async findAllByJob(companyId: string | null | undefined, jobId: string) {
    if (!companyId) {
      throw new BadRequestException(
        'Recruiter must have a company to list job applications',
      );
    }
    if (!isUUID(jobId)) {
      throw new BadRequestException('jobId must be a valid UUID');
    }

    const [job, applications] = await Promise.all([
      this.db.job.findFirst({
        where: { id: jobId, companyId },
        select: { id: true },
      }),
      this.db.application.findMany({
        where: { jobId, companyId },
        orderBy: { appliedAt: 'desc' },
        select: jobApplicationsSelect,
      }),
    ]);

    if (!job) throw new NotFoundException('Job not found');
    return applications;
  }

  async applyWithParsedData(
    dto: ApplyWithParsedDto,
    file: UploadedResumeFileDto,
  ) {
    await this.ensureJobAndCompanyExist(dto.jobId, dto.companyId);

    const { parsed, resumeUrl } =
      await this.resumeService.prepareForFinalization(file);

    let result: {
      applicationId: string;
      candidateId: string;
      resumeId: string;
      resumeUrl: string;
      status: ApplicationStatus;
    };

    try {
      result = await this.db.$transaction(async (tx) => {
        const fullName = this.buildFullName(
          dto.personal.firstName,
          dto.personal.lastName,
        );
        const email = this.normalizeEmail(dto.personal.email);

        const candidatePatch = this.safeUpdate({
          fullName: fullName || 'Unknown',
          email,
          phone: this.normalizeText(dto.personal.phone),
          location: this.normalizeText(dto.personal.address),
        });

        const existingByEmail = email
          ? await this.candidateService.findByEmail(email, tx)
          : null;

        const candidate = existingByEmail
          ? await this.candidateService.updateCandidate(
              existingByEmail.id,
              candidatePatch,
              tx,
            )
          : await this.candidateService.createCandidate(
              candidatePatch as {
                fullName: string;
                email?: string;
                phone?: string;
                location?: string;
              },
              tx,
            );

        const existingApplication = await tx.application.findFirst({
          where: { candidateId: candidate.id, jobId: dto.jobId },
          select: { id: true },
        });

        if (existingApplication) {
          throw new ConflictException(
            'Application already exists for this job',
          );
        }

        const resume = await this.resumeService.saveResumeRecord(
          {
            candidateId: candidate.id,
            resumeUrl,
            fileName: file.originalname,
            parsed,
          },
          tx,
        );

        const application = await tx.application.create({
          data: {
            candidateId: candidate.id,
            jobId: dto.jobId,
            companyId: dto.companyId,
            resumeId: resume.id,
            status: ApplicationStatus.APPLIED,
            source: ApplicationSource.FORM_FILL,
          },
          select: { id: true, status: true },
        });

        return {
          applicationId: application.id,
          candidateId: candidate.id,
          resumeId: resume.id,
          resumeUrl,
          status: application.status,
        };
      });
    } catch (error) {
      await this.resumeService.deleteStorageFile(resumeUrl).catch(() => {
        // best-effort; don't mask the original error
      });
      throw error;
    }

    this.rankingService
      .scoreAndRankApplication(result.applicationId)
      .catch((error) => {
        this.logger.error(
          `Background ranking failed for application ${result.applicationId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });

    return result;
  }
}
