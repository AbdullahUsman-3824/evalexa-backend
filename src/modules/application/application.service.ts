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
  shortlistCardSelect,
} from './application.select';
import { isUUID } from 'class-validator';
import { CandidateService } from '../candidate/candidate.service';
import { DatabaseService } from '../../database/database.service';
import { ResumeService } from '../resume/resume.service';
import { UploadedResumeFileDto } from '../resume/dto/uploaded-resume-file.dto';
import { ApplyWithParsedDto } from './dto/apply-with-parsed.dto';
import { FindJobApplicationsQueryDto } from './dto/find-job-applications-query.dto';
import { ShortlistListQueryDto } from './dto/shortlist-list-query.dto';
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

    await this.requireOwnedJob(companyId, jobId);

    const where: Prisma.ApplicationWhereInput = {
      jobId,
      companyId,
      ...(status?.length ? { status: { in: status } } : {}),
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
      this.db.application.count({ where }),
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

      if (resumeUrl) {
        await this.resumeService.deleteStorageFile(resumeUrl).catch(() => {});
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

    await this.requireOwnedJob(companyId, jobId);

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

  async getShortlisted(
    companyId: string,
    jobId: string,
    query: ShortlistListQueryDto = {},
  ) {
    if (!companyId) {
      throw new BadRequestException(
        'Recruiter must have a company to list shortlisted candidates',
      );
    }

    const job = await this.requireOwnedJob(companyId, jobId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const order = query.order === 'desc' ? 'desc' : 'asc';

    const where: Prisma.ApplicationWhereInput = {
      jobId,
      companyId,
      status: ApplicationStatus.SHORTLISTED,
    };

    const orderBy = this.buildShortlistOrderBy(
      query.sortBy === 'name'
        ? 'name'
        : query.sortBy === 'source'
          ? 'source'
          : 'match_score',
      order,
    );

    const [total, rows, stats] = await Promise.all([
      this.db.application.count({ where }),
      this.db.application.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: shortlistCardSelect(),
      }),
      this.computeShortlistStats(jobId, companyId),
    ]);

    return {
      success: true,
      data: {
        job: {
          id: job.id,
          title: job.title,
          company: job.company?.name ?? null,
          department: job.department,
          applicantsCount: stats.totalApplicants,
        },
        candidates: rows.map((r) => this.toShortlistCard(r, 'shortlisted')),
        stats: {
          totalShortlisted: stats.totalShortlisted,
          aiSelected: stats.aiSelected,
          manuallyAdded: stats.manuallyAdded,
          totalRejected: stats.poolNotShortlisted,
          isFinalized: stats.isFinalized,
          finalizedAt: null,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    };
  }

  async getRejected(
    companyId: string,
    jobId: string,
    query: ShortlistListQueryDto = {},
  ) {
    if (!companyId) {
      throw new BadRequestException(
        'Recruiter must have a company to list candidates',
      );
    }
    await this.requireOwnedJob(companyId, jobId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const order = query.order === 'desc' ? 'desc' : 'asc';

    const where: Prisma.ApplicationWhereInput = {
      jobId,
      companyId,
      status: ApplicationStatus.APPLIED,
      ...(query.search && {
        candidate: {
          OR: [
            {
              fullName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          ],
        },
      }),
    };

    const orderBy = this.buildShortlistOrderBy(
      query.sortBy === 'name' ? 'name' : 'match_score',
      order,
    );

    const [total, rows] = await Promise.all([
      this.db.application.count({ where }),
      this.db.application.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: shortlistCardSelect(),
      }),
    ]);

    return {
      success: true,
      data: {
        candidates: rows.map((r) => this.toShortlistCard(r, 'pool')),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    };
  }

  async shortlistOne(companyId: string, applicationId: string) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    const app = await this.findOwnedApplication(applicationId, companyId);

    if (app.status === ApplicationStatus.SHORTLISTED) {
      throw new BadRequestException('Candidate is already shortlisted.');
    }

    if (app.status !== ApplicationStatus.APPLIED) {
      throw new BadRequestException(
        `Cannot shortlist application in status ${app.status}`,
      );
    }

    const updated = await this.db.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.SHORTLISTED,
        isAutoShortlisted: false,
      },
      select: {
        id: true,
        candidateId: true,
        status: true,
        isAutoShortlisted: true,
        updatedAt: true,
        candidate: { select: { fullName: true } },
      },
    });

    return {
      success: true,
      message: 'Candidate shortlisted successfully.',
      data: {
        applicationId: updated.id,
        candidateId: updated.candidateId,
        name: updated.candidate.fullName,
        status: 'manually_shortlisted',
        shortlistSource: 'manual',
        overriddenAt: updated.updatedAt.toISOString(),
      },
    };
  }

  /**
   * API 4 — Remove from shortlist (override)
   * SHORTLISTED → APPLIED (still pre-interview; do NOT set REJECTED)
   */
  async unshortlistOne(
    companyId: string,
    applicationId: string,
    reason?: string,
  ) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    this.assertUuid(applicationId, 'applicationId');

    if (reason != null && reason.length > 500) {
      throw new BadRequestException('reason max 500 characters');
    }

    const app = await this.findOwnedApplication(applicationId, companyId);

    if (app.status !== ApplicationStatus.SHORTLISTED) {
      throw new BadRequestException(
        `Only SHORTLISTED applications can be removed from shortlist (current: ${app.status})`,
      );
    }

    const updated = await this.db.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.APPLIED,
        // isAutoShortlisted intentionally preserved for audit
      },
      select: {
        id: true,
        candidateId: true,
        status: true,
        isAutoShortlisted: true,
        updatedAt: true,
        candidate: { select: { fullName: true } },
      },
    });

    this.logger.log(
      `Unshortlisted ${applicationId}` +
        (reason ? ` reason=${reason.slice(0, 200)}` : '') +
        (app.isAutoShortlisted ? ' [was auto-shortlisted]' : ''),
    );

    return {
      success: true,
      message: 'Candidate removed from shortlist.',
      data: {
        applicationId: updated.id,
        candidateId: updated.candidateId,
        name: updated.candidate.fullName,
        status: 'applied',
        shortlistSource: null,
        overriddenAt: updated.updatedAt.toISOString(),
        reason: reason ?? null,
      },
    };
  }

  /**
   * API 5 — Bulk shortlist selected application IDs
   */
  async bulkShortlist(
    companyId: string,
    jobId: string,
    applicationIds: string[],
  ) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      throw new BadRequestException(
        'applicationIds must be a non-empty array.',
      );
    }
    if (applicationIds.length > 50) {
      throw new BadRequestException('applicationIds max length is 50.');
    }
    this.assertUuid(jobId, 'jobId');
    await this.requireOwnedJob(companyId, jobId);

    const shortlisted: Array<{
      applicationId: string;
      candidateId: string;
      name: string;
      status: string;
      shortlistSource: string;
    }> = [];
    const failedIds: string[] = [];

    for (const id of applicationIds) {
      try {
        if (!isUUID(id)) {
          failedIds.push(id);
          continue;
        }
        // Must belong to this job
        const owned = await this.db.application.findFirst({
          where: { id, jobId, companyId },
          select: { id: true },
        });
        if (!owned) {
          failedIds.push(id);
          continue;
        }
        const result = await this.shortlistOne(companyId, id);
        shortlisted.push({
          applicationId: result.data.applicationId,
          candidateId: result.data.candidateId,
          name: result.data.name,
          status: result.data.status,
          shortlistSource: result.data.shortlistSource,
        });
      } catch {
        failedIds.push(id);
      }
    }

    const partial = failedIds.length > 0;
    return {
      success: true,
      partial,
      message: partial
        ? `${shortlisted.length} of ${applicationIds.length} candidates shortlisted. ${failedIds.length} failed or already shortlisted.`
        : `${shortlisted.length} candidates shortlisted successfully.`,
      data: {
        shortlisted,
        failedIds,
        shortlistedCount: shortlisted.length,
        failedCount: failedIds.length,
      },
    };
  }

  /**
   * API 6 — Top N not-shortlisted (APPLIED) by match score
   */
  async getTopNRejected(companyId: string, jobId: string, n: number) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    this.assertUuid(jobId, 'jobId');

    if (!Number.isInteger(n) || n < 1 || n > 50) {
      throw new BadRequestException('n must be between 1 and 50.');
    }

    await this.requireOwnedJob(companyId, jobId);

    const where: Prisma.ApplicationWhereInput = {
      jobId,
      companyId,
      status: ApplicationStatus.APPLIED,
    };

    const [totalRejected, rows] = await Promise.all([
      this.db.application.count({ where }),
      this.db.application.findMany({
        where,
        orderBy: [
          { matchScore: 'desc' },
          { rankPosition: 'asc' },
          { appliedAt: 'asc' },
        ],
        take: n,
        select: shortlistCardSelect(),
      }),
    ]);

    return {
      success: true,
      data: {
        candidates: rows.map((r) => this.toShortlistCard(r, 'pool')),
        requestedN: n,
        returnedCount: rows.length,
        totalRejected,
      },
    };
  }

  /**
   * API 7 — Finalize shortlist
   * SHORTLISTED → INTERVIEW
   * remaining APPLIED → REJECTED
   *
   * No isFinalized column: derived from INTERVIEW present + no SHORTLISTED left.
   */
  async finalizeShortlist(companyId: string, jobId: string) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    this.assertUuid(jobId, 'jobId');

    const job = await this.requireOwnedJob(companyId, jobId);

    const shortlistedCount = await this.db.application.count({
      where: {
        jobId,
        companyId,
        status: ApplicationStatus.SHORTLISTED,
      },
    });

    if (shortlistedCount === 0) {
      const alreadyInterview = await this.db.application.count({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.INTERVIEW,
        },
      });
      if (alreadyInterview > 0) {
        throw new ConflictException({
          success: false,
          message: 'Shortlist is already finalized for this job.',
          data: { finalizedAt: null },
        });
      }
      throw new BadRequestException(
        'Cannot finalize. No candidates are shortlisted for this job.',
      );
    }

    const [toInterview, toReject] = await this.db.$transaction([
      this.db.application.updateMany({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.SHORTLISTED,
        },
        data: { status: ApplicationStatus.INTERVIEW },
      }),
      this.db.application.updateMany({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.APPLIED,
        },
        data: { status: ApplicationStatus.REJECTED },
      }),
    ]);

    // Optional: enqueue shortlist notification emails for INTERVIEW apps
    // this.applicationProcessingProducer.enqueueShortlistEmails?.(jobId).catch(...)

    this.logger.log(
      `Finalized shortlist job=${jobId}: interview=${toInterview.count} rejected=${toReject.count}`,
    );

    return {
      success: true,
      message: `Shortlist finalized. ${toInterview.count} candidates moved to interview.`,
      data: {
        jobId,
        jobTitle: job.title,
        finalizedAt: new Date().toISOString(),
        stats: {
          totalNotified: toInterview.count,
          aiSelected: null as number | null,
          manuallyAdded: null as number | null,
          movedToInterview: toInterview.count,
          movedToRejected: toReject.count,
          emailsSent: 0,
          emailsFailed: 0,
        },
      },
    };
  }

  /**
   * API 8 — Save draft (no lastSavedAt on Job — ephemeral response only)
   */
  async saveShortlistDraft(companyId: string, jobId: string) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    this.assertUuid(jobId, 'jobId');
    await this.requireOwnedJob(companyId, jobId);

    const stats = await this.computeShortlistStats(jobId, companyId);

    return {
      success: true,
      message: 'Shortlist draft saved.',
      data: {
        jobId,
        lastSavedAt: new Date().toISOString(),
        currentStats: {
          totalShortlisted: stats.totalShortlisted,
          totalRejected: stats.poolNotShortlisted,
        },
      },
    };
  }

  /**
   * API 9 — Lightweight shortlist stats
   */
  async getShortlistStats(companyId: string, jobId: string) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }
    this.assertUuid(jobId, 'jobId');
    await this.requireOwnedJob(companyId, jobId);

    const stats = await this.computeShortlistStats(jobId, companyId);

    return {
      success: true,
      data: {
        jobId,
        totalApplicants: stats.totalApplicants,
        totalShortlisted: stats.totalShortlisted,
        aiSelected: stats.aiSelected,
        manuallyAdded: stats.manuallyAdded,
        totalRejected: stats.poolNotShortlisted,
        aiRejected: stats.poolNotShortlisted,
        manuallyRejected: 0,
        isFinalized: stats.isFinalized,
        finalizedAt: null,
        lastSavedAt: null,
      },
    };
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private toShortlistCard(
    app: {
      id: string;
      candidateId: string;
      status: ApplicationStatus;
      matchScore: number | null;
      isAutoShortlisted: boolean;
      updatedAt: Date;
      appliedAt: Date;
      candidate: { id: string; fullName: string; email: string | null };
      resume: {
        extractedSkills: unknown;
        extractedExperience: unknown;
      } | null;
      analysis: { matchedSkills: unknown; overallScore: number | null }[];
    },
    mode: 'shortlisted' | 'pool',
  ) {
    const name = app.candidate.fullName || 'Unknown';
    const initials =
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || '?';

    const fromAnalysis = app.analysis?.[0]?.matchedSkills;
    const fromResume = app.resume?.extractedSkills;
    const skills: string[] = Array.isArray(fromAnalysis)
      ? (fromAnalysis as string[])
      : Array.isArray(fromResume)
        ? (fromResume as string[])
        : [];

    const base = {
      applicationId: app.id,
      candidateId: app.candidate.id,
      name,
      initials,
      role: null as string | null,
      matchScore: app.matchScore ?? null,
      skills,
      experience: null as string | null,
      avatarUrl: null as string | null,
    };

    if (mode === 'shortlisted') {
      return {
        ...base,
        source: app.isAutoShortlisted
          ? 'ai_shortlisted'
          : 'manually_shortlisted',
        shortlistedAt: app.updatedAt.toISOString(),
        overriddenAt: null as string | null,
      };
    }

    return {
      ...base,
      rejectedSource: 'not_shortlisted',
      rejectedAt: app.updatedAt.toISOString(),
    };
  }

  private buildShortlistOrderBy(
    sortBy: 'match_score' | 'name' | 'source',
    order: 'asc' | 'desc',
  ): Prisma.ApplicationOrderByWithRelationInput[] {
    if (sortBy === 'name') {
      return [{ candidate: { fullName: order } }];
    }
    if (sortBy === 'source') {
      // true first when order=asc → flip so AI (true) groups together
      return [{ isAutoShortlisted: order === 'asc' ? 'desc' : 'asc' }];
    }
    return [{ matchScore: order }, { rankPosition: 'asc' }];
  }

  private async computeShortlistStats(jobId: string, companyId: string) {
    const [
      totalApplicants,
      totalShortlisted,
      aiSelected,
      manuallyAdded,
      poolNotShortlisted,
      interviewCount,
    ] = await Promise.all([
      this.db.application.count({ where: { jobId, companyId } }),
      this.db.application.count({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.SHORTLISTED,
        },
      }),
      this.db.application.count({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.SHORTLISTED,
          isAutoShortlisted: true,
        },
      }),
      this.db.application.count({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.SHORTLISTED,
          isAutoShortlisted: false,
        },
      }),
      this.db.application.count({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.APPLIED,
        },
      }),
      this.db.application.count({
        where: {
          jobId,
          companyId,
          status: ApplicationStatus.INTERVIEW,
        },
      }),
    ]);

    const isFinalized = totalShortlisted === 0 && interviewCount > 0;

    return {
      totalApplicants,
      totalShortlisted,
      aiSelected,
      manuallyAdded,
      poolNotShortlisted,
      interviewCount,
      isFinalized,
    };
  }

  private async findOwnedApplication(applicationId: string, companyId: string) {
    const app = await this.db.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        jobId: true,
        status: true,
        isAutoShortlisted: true,
        matchScore: true,
        rankPosition: true,
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (app.companyId !== companyId) {
      throw new ForbiddenException(
        'You can only manage candidates for your own job posts.',
      );
    }
    return app;
  }

  private async requireOwnedJob(companyId: string, jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, companyId },
      select: {
        id: true,
        title: true,
        department: true,
        company: { select: { name: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }
    return job;
  }

  private assertUuid(value: string, field: string) {
    if (!isUUID(value)) {
      throw new BadRequestException(`${field} must be a valid UUID`);
    }
  }

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
