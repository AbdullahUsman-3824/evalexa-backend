import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApplicationSource,
  ApplicationStatus,
  Prisma,
  ProcessingTaskType,
} from '@prisma/client';
import {
  jobApplicationsListSelect,
  applicationDetailSelect,
} from './application.select';
import { isUUID } from 'class-validator';
import { CandidateService } from '../candidate/candidate.service';
import { DatabaseService } from '../../database/database.service';
import { ResumeService } from '../resume/resume.service';
import { UploadedResumeFileDto } from '../resume/dto/uploaded-resume-file.dto';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { FindJobApplicationsQueryDto } from './dto/find-job-applications-query.dto';
import { ApplicationProcessingProducer } from '../processing/producers/application-processing.producer';
import type { Express } from 'express';

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    private readonly candidateService: CandidateService,
    private readonly resumeService: ResumeService,
    private readonly db: DatabaseService,
    private readonly applicationProcessingProducer: ApplicationProcessingProducer,
  ) {}

  async findByCandidateAndJob(candidateId: string, jobId: string) {
    return this.db.application.findFirst({
      where: { candidateId, jobId },
      select: { id: true, status: true, appliedAt: true },
    });
  }

  async getApplication(recruiterCompanyId: string, applicationId: string) {
    if (!isUUID(applicationId)) {
      throw new BadRequestException('applicationId must be a valid UUID');
    }

    const raw = await this.db.application.findUnique({
      where: { id: applicationId, companyId: recruiterCompanyId },
      select: applicationDetailSelect,
    });

    if (!raw) {
      throw new NotFoundException('Application not found');
    }

    if (raw.companyId !== recruiterCompanyId) {
      throw new ForbiddenException(
        'You do not have access to this application',
      );
    }

    // Resolve processing statuses
    const getTaskStatus = (taskType: ProcessingTaskType) =>
      raw.processingTasks.find((t) => t.taskType === taskType)?.status ?? null;

    const analysis = raw.analysis[0] ?? null;

    return {
      application: {
        id: raw.id,
        status: raw.status,
        source: raw.source,
        matchScore: raw.matchScore,
        rankPosition: raw.rankPosition,
        isAutoShortlisted: raw.isAutoShortlisted,
        appliedAt: raw.appliedAt,
        updatedAt: raw.updatedAt,
      },
      job: raw.job,
      candidate: raw.candidate,
      resume: raw.resume,
      analysis: analysis
        ? {
            skillMatchScore: analysis.skillMatchScore,
            experienceScore: analysis.experienceScore,
            educationScore: analysis.educationScore,
            overallScore: analysis.overallScore,
            matchedSkills: analysis.matchedSkills,
            missingSkills: analysis.missingSkills,
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            aiSummary: analysis.aiSummary,
            recommendation: analysis.recommendation,
            analyzedAt: analysis.analyzedAt,
          }
        : null,
      processing: {
        resumeParse: getTaskStatus('RESUME_PARSE'),
        resumeAnalysis: getTaskStatus('RESUME_ANALYSIS'),
      },
    };
  }

  async findAllByJob(
    companyId: string | null | undefined,
    jobId: string,
    query: FindJobApplicationsQueryDto,
  ) {
    if (!companyId) {
      throw new BadRequestException(
        'Recruiter must have a company to list job applications',
      );
    }

    if (!isUUID(jobId)) {
      throw new BadRequestException('jobId must be a valid UUID');
    }

    const {
      page = 1,
      limit = 20,
      search,
      status,
      sortBy = 'rankPosition',
      sortOrder = 'asc',
    } = query;

    // Make sure the job belongs to the recruiter's company.
    const job = await this.db.job.findFirst({
      where: {
        id: jobId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const where: Prisma.ApplicationWhereInput = {
      jobId,
      companyId,

      ...(status && {
        status,
      }),

      ...(search && {
        candidate: {
          OR: [
            {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
    };

    const orderBy: Prisma.ApplicationOrderByWithRelationInput =
      sortBy === 'matchScore'
        ? { matchScore: sortOrder }
        : sortBy === 'appliedAt'
          ? { appliedAt: sortOrder }
          : { rankPosition: sortOrder };

    const skip = (page - 1) * limit;

    const [total, applications] = await Promise.all([
      this.db.application.count({
        where,
      }),

      this.db.application.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: jobApplicationsListSelect,
      }),
    ]);

    return {
      data: applications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async applyWithParsedData(
    dto: ApplyWithParsedDto,
    file: UploadedResumeFileDto,
  ) {
    await this.ensureJobAndCompanyExist(dto.jobId, dto.companyId);

    let result: {
      applicationId: string;
      candidateId: string;
      resumeId: string;
      resumeUrl: string;
      status: ApplicationStatus;
    };

    // Upload happens outside the transaction — DB connection is never
    // held open waiting on Supabase storage.
    const uploaded = await this.resumeService.uploadResumeFile(file);
    const resumeUrl = uploaded.resumeUrl;

    try {
      result = await this.db.$transaction(async (tx) => {
        const personal = dto.personal;
        const fullName = this.buildFullName(
          personal.firstName,
          personal.lastName,
        );
        const email = this.normalizeEmail(personal.email);

        const candidate = await this.candidateService.upsertByEmail(
          {
            fullName: fullName || 'Unknown',
            email,
            phone: this.normalizeText(personal.phone),
            location: this.normalizeText(personal.address),
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

        const resume = await this.resumeService.createResumeRecord(
          {
            candidateId: candidate.id,
            resumeUrl: uploaded.resumeUrl,
            fileName: uploaded.fileName,
            submitted: {
              personal,
              education: dto.education,
              experience: dto.experience,
              skills: dto.skills,
            },
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
          resumeUrl: resume.resumeUrl,
          status: application.status,
        };
      });
    } catch (error) {
      console.error('Error during application submission:', error);

      // Transaction failed — resume was uploaded before it started, so
      // clean it up here to avoid an orphaned file in storage.
      if (resumeUrl) {
        await this.resumeService.deleteStorageFile(resumeUrl).catch(() => {
          // best-effort
        });
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting application';

      throw new InternalServerErrorException(message);
    }

    this.applicationProcessingProducer
      .enqueueApplicationProcessing(result.applicationId, dto.jobId)
      .catch((error) => {
        this.logger.error(
          `Failed to enqueue processing for application ${result.applicationId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });

    return result;
  }

  async bulkImportResumes(
    jobId: string,
    companyId: string,
    files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one resume file is required');
    }

    await this.ensureJobAndCompanyExist(jobId, companyId);

    const job = await this.db.job.findFirst({
      where: { id: jobId, companyId },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found for this company');
    }

    const accepted: Array<{
      applicationId: string;
      candidateId: string;
      resumeId: string;
      fileName: string;
    }> = [];
    const rejected: Array<{ fileName: string; reason: string }> = [];

    for (const file of files) {
      const fileName = file.originalname ?? 'resume.pdf';
      let resumeUrl: string | undefined;

      try {
        // Placeholder candidate until parse fills email/name
        const candidate = await this.candidateService.createCandidate({
          fullName: fileName.replace(/\.[^.]+$/, '') || 'Bulk Import',
        });

        const resume = await this.resumeService.uploadRawResumeForCandidate({
          file: {
            buffer: file.buffer,
            originalname: fileName,
            mimetype: file.mimetype,
          },
          candidateId: candidate.id,
        });
        resumeUrl = resume.resumeUrl;

        const application = await this.db.application.create({
          data: {
            candidateId: candidate.id,
            jobId,
            companyId,
            resumeId: resume.id,
            status: ApplicationStatus.APPLIED,
            source: ApplicationSource.IMPORT,
          },
          select: { id: true },
        });

        await this.applicationProcessingProducer.enqueueResumeParse(
          application.id,
          jobId,
        );

        accepted.push({
          applicationId: application.id,
          candidateId: candidate.id,
          resumeId: resume.id,
          fileName,
        });
      } catch (error) {
        if (resumeUrl) {
          await this.resumeService.deleteStorageFile(resumeUrl).catch(() => {});
        }
        rejected.push({
          fileName,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      jobId,
      companyId,
      accepted: accepted.length,
      rejected: rejected.length,
      applications: accepted,
      errors: rejected,
    };
  }

  // Private Helpers
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
}
