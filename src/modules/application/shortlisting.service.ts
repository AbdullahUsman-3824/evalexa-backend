import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, ProcessingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { isUUID } from 'class-validator';

export type ShortlistOptions = {
  /** true = system / deadline-driven auto shortlist */
  auto?: boolean;
  /** Override config; if omitted uses JobAiConfig.minimumMatchScore */
  minScore?: number | null;
  /**
   * Required for manual shortlist (recruiter).
   * Null/undefined for system auto path.
   */
  companyId?: string | null;
};

export type ShortlistTopResult = {
  jobId: string;
  requested: number;
  shortlisted: number;
  applicationIds: string[];
  skippedReason?: string;
};

export type BulkShortlistResult = {
  shortlistedCount: number;
  failedCount: number;
  failedIds: string[];
  message: string;
};

@Injectable()
export class ShortlistingService {
  private readonly logger = new Logger(ShortlistingService.name);

  constructor(private readonly db: DatabaseService) {}

  // ─── Top N (manual or auto) ─────────────────────────────────────────

  /**
   * Shortlist top N APPLIED applications for a job by rankPosition.
   * Optional minimumMatchScore filter may return fewer than N.
   * auto=true → isAutoShortlisted = true.
   * Manual path requires companyId and verifies job ownership.
   */
  async shortlistTopN(
    jobId: string,
    count: number,
    opts: ShortlistOptions = {},
  ): Promise<ShortlistTopResult> {
    this.assertUuid(jobId, 'jobId');
    if (!Number.isInteger(count) || count < 1) {
      throw new BadRequestException('count must be a positive integer');
    }

    // Manual: must own the job. Auto: system path, no company check.
    if (!opts.auto) {
      if (!opts.companyId) {
        throw new BadRequestException(
          'companyId is required for manual shortlist',
        );
      }
      this.assertUuid(opts.companyId, 'companyId');
      await this.assertJobOwnedByCompany(jobId, opts.companyId);
    }

    const job = await this.db.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        aiConfig: {
          select: {
            enableAutoShortlisting: true,
            shortlistLimit: true,
            minimumMatchScore: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (opts.auto && !(await this.isRankingReady(jobId))) {
      return {
        jobId,
        requested: count,
        shortlisted: 0,
        applicationIds: [],
        skippedReason: 'RANKING_NOT_READY',
      };
    }

    const minScore =
      opts.minScore !== undefined
        ? opts.minScore
        : (job.aiConfig?.minimumMatchScore ?? null);

    const where: Prisma.ApplicationWhereInput = {
      jobId,
      status: ApplicationStatus.APPLIED,
      ...(minScore != null ? { matchScore: { gte: minScore } } : {}),
    };

    const candidates = await this.db.application.findMany({
      where,
      orderBy: [
        { rankPosition: 'asc' },
        { matchScore: 'desc' },
        { appliedAt: 'asc' },
      ],
      take: count,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return {
        jobId,
        requested: count,
        shortlisted: 0,
        applicationIds: [],
        skippedReason: 'NO_QUALIFIED_APPLICATIONS',
      };
    }

    const ids = candidates.map((c) => c.id);
    const isAuto = !!opts.auto;

    const { count: updatedCount } = await this.db.application.updateMany({
      where: {
        id: { in: ids },
        status: ApplicationStatus.APPLIED,
      },
      data: {
        status: ApplicationStatus.SHORTLISTED,
        isAutoShortlisted: isAuto,
      },
    });

    const shortlistedApps =
      updatedCount === ids.length
        ? ids
        : (
            await this.db.application.findMany({
              where: {
                id: { in: ids },
                status: ApplicationStatus.SHORTLISTED,
              },
              select: { id: true },
            })
          ).map((a) => a.id);

    this.logger.log(
      `Shortlisted ${shortlistedApps.length}/${count} for job ${jobId} (auto=${isAuto})`,
    );

    return {
      jobId,
      requested: count,
      shortlisted: shortlistedApps.length,
      applicationIds: shortlistedApps,
    };
  }

  /**
   * Auto shortlist after deadline close using JobAiConfig.shortlistLimit.
   * Internal / cron only — do not expose as a public HTTP route.
   */
  async runAutoShortlistForJob(jobId: string): Promise<ShortlistTopResult> {
    this.assertUuid(jobId, 'jobId');

    const job = await this.db.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        aiConfig: {
          select: {
            enableAutoShortlisting: true,
            shortlistLimit: true,
            minimumMatchScore: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (!job.aiConfig?.enableAutoShortlisting) {
      return {
        jobId,
        requested: 0,
        shortlisted: 0,
        applicationIds: [],
        skippedReason: 'AUTO_SHORTLISTING_DISABLED',
      };
    }

    const limit = job.aiConfig.shortlistLimit;
    if (limit == null || limit < 1) {
      return {
        jobId,
        requested: 0,
        shortlisted: 0,
        applicationIds: [],
        skippedReason: 'SHORTLIST_LIMIT_NOT_SET',
      };
    }

    return this.shortlistTopN(jobId, limit, {
      auto: true,
      minScore: job.aiConfig.minimumMatchScore,
      companyId: null,
    });
  }

  // ─── Single application ─────────────────────────────────────────────

  /**
   * Shortlist one APPLIED application. Idempotent if already SHORTLISTED.
   */
  async shortlistOne(applicationId: string, companyId: string) {
    this.assertUuid(applicationId, 'applicationId');
    this.assertUuid(companyId, 'companyId');

    const app = await this.findOwnedApplication(applicationId, companyId);

    if (app.status === ApplicationStatus.SHORTLISTED) {
      return {
        success: true,
        message: 'Candidate is already shortlisted.',
      };
    }

    if (app.status !== ApplicationStatus.APPLIED) {
      throw new BadRequestException({
        success: false,
        message: `Cannot shortlist application in status ${app.status}`,
        error: 'INVALID_STATUS_TRANSITION',
      });
    }

    const { count } = await this.db.application.updateMany({
      where: {
        id: applicationId,
        status: ApplicationStatus.APPLIED,
        companyId,
      },
      data: {
        status: ApplicationStatus.SHORTLISTED,
        isAutoShortlisted: false,
      },
    });

    if (count === 0) {
      const current = await this.findOwnedApplication(applicationId, companyId);
      if (current.status === ApplicationStatus.SHORTLISTED) {
        return {
          success: true,
          message: 'Candidate is already shortlisted.',
        };
      }
      throw new BadRequestException({
        success: false,
        message: `Cannot shortlist application in status ${current.status}`,
        error: 'INVALID_STATUS_TRANSITION',
      });
    }

    return {
      success: true,
      message: 'Candidate shortlisted successfully.',
    };
  }

  /**
   * Unshortlist → APPLIED. isAutoShortlisted is preserved for audit.
   */
  async unshortlistOne(applicationId: string, companyId: string) {
    this.assertUuid(applicationId, 'applicationId');
    this.assertUuid(companyId, 'companyId');

    const app = await this.findOwnedApplication(applicationId, companyId);

    if (app.status !== ApplicationStatus.SHORTLISTED) {
      throw new BadRequestException(
        `Only SHORTLISTED applications can be unshortlisted (current: ${app.status})`,
      );
    }

    const { count } = await this.db.application.updateMany({
      where: {
        id: applicationId,
        status: ApplicationStatus.SHORTLISTED,
        companyId,
      },
      data: {
        status: ApplicationStatus.APPLIED,
      },
    });

    if (count === 0) {
      const current = await this.findOwnedApplication(applicationId, companyId);
      throw new BadRequestException(
        `Only SHORTLISTED applications can be unshortlisted (current: ${current.status})`,
      );
    }

    return {
      success: true,
      message: 'Candidate unshortlisted successfully.',
    };
  }

  // ─── Bulk ───────────────────────────────────────────────────────────

  /**
   * Bulk shortlist selected APPLIED applications for a job.
   * Already SHORTLISTED are treated as success (idempotent).
   * Skips invalid / not-owned / wrong-job / wrong status.
   * Max 50 ids.
   */
  async bulkShortlist(
    jobId: string,
    applicationIds: string[],
    companyId: string,
  ): Promise<BulkShortlistResult> {
    this.assertUuid(jobId, 'jobId');
    this.assertUuid(companyId, 'companyId');

    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      throw new BadRequestException(
        'applicationIds must be a non-empty array.',
      );
    }
    if (applicationIds.length > 50) {
      throw new BadRequestException(
        'applicationIds must contain at most 50 items.',
      );
    }

    const uniqueIds = [...new Set(applicationIds)];
    for (const id of uniqueIds) {
      this.assertUuid(id, 'applicationId');
    }

    await this.assertJobOwnedByCompany(jobId, companyId);

    const apps = await this.db.application.findMany({
      where: {
        id: { in: uniqueIds },
        jobId,
        companyId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    const foundIds = new Set(apps.map((a) => a.id));
    const failedIds: string[] = [];
    const toShortlist: string[] = [];

    for (const id of uniqueIds) {
      if (!foundIds.has(id)) {
        failedIds.push(id);
      }
    }

    for (const app of apps) {
      if (app.status === ApplicationStatus.SHORTLISTED) {
        continue;
      }
      if (app.status === ApplicationStatus.APPLIED) {
        toShortlist.push(app.id);
      } else {
        failedIds.push(app.id);
      }
    }

    let shortlistedCount = 0;
    if (toShortlist.length > 0) {
      const { count } = await this.db.application.updateMany({
        where: {
          id: { in: toShortlist },
          status: ApplicationStatus.APPLIED,
          jobId,
          companyId,
        },
        data: {
          status: ApplicationStatus.SHORTLISTED,
          isAutoShortlisted: false,
        },
      });
      shortlistedCount = count;

      if (shortlistedCount < toShortlist.length) {
        const actuallyUpdated = await this.db.application.findMany({
          where: {
            id: { in: toShortlist },
            status: ApplicationStatus.SHORTLISTED,
          },
          select: { id: true },
        });
        const updatedSet = new Set(actuallyUpdated.map((a) => a.id));
        for (const id of toShortlist) {
          if (!updatedSet.has(id)) {
            failedIds.push(id);
          }
        }
        shortlistedCount = actuallyUpdated.length;
      }
    }

    const alreadyShortlisted = apps.filter(
      (a) => a.status === ApplicationStatus.SHORTLISTED,
    ).length;
    const effectiveSuccess = shortlistedCount + alreadyShortlisted;
    const failedCount = failedIds.length;
    const totalRequested = uniqueIds.length;

    let message: string;
    if (failedCount === 0) {
      message = `${effectiveSuccess} candidate${effectiveSuccess === 1 ? '' : 's'} shortlisted successfully.`;
    } else if (effectiveSuccess === 0) {
      message = `0 of ${totalRequested} candidates shortlisted.`;
    } else {
      message = `${effectiveSuccess} of ${totalRequested} candidates shortlisted. ${failedCount} failed.`;
    }

    this.logger.log(
      `Bulk shortlist job=${jobId}: shortlisted=${shortlistedCount}, already=${alreadyShortlisted}, failed=${failedCount}`,
    );

    return {
      shortlistedCount: effectiveSuccess,
      failedCount,
      failedIds: [...new Set(failedIds)],
      message,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Ranking is ready when processing is COMPLETED or at least one rank exists.
   */
  async isRankingReady(jobId: string): Promise<boolean> {
    const jp = await this.db.jobProcessing.findUnique({
      where: { jobId },
      select: { status: true },
    });

    if (jp?.status === ProcessingStatus.COMPLETED) {
      return true;
    }

    return this.hasRanks(jobId);
  }

  async hasRanks(jobId: string): Promise<boolean> {
    const ranked = await this.db.application.count({
      where: { jobId, rankPosition: { not: null } },
    });
    return ranked > 0;
  }

  private async findOwnedApplication(applicationId: string, companyId: string) {
    const app = await this.db.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        status: true,
        isAutoShortlisted: true,
        rankPosition: true,
        matchScore: true,
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (app.companyId !== companyId) {
      throw new ForbiddenException(
        'You do not have access to this application',
      );
    }
    return app;
  }

  private async assertJobOwnedByCompany(jobId: string, companyId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, companyId },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
  }

  private assertUuid(value: string, field: string) {
    if (!isUUID(value)) {
      throw new BadRequestException(`${field} must be a valid UUID`);
    }
  }
}
