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
  /** Recruiter user id; null for system */
  actorUserId?: string | null;
};

export type ShortlistTopResult = {
  jobId: string;
  requested: number;
  shortlisted: number;
  applicationIds: string[];
  skippedReason?: string;
};

@Injectable()
export class ShortlistingService {
  private readonly logger = new Logger(ShortlistingService.name);

  constructor(private readonly db: DatabaseService) {}

  // ─── Top N (manual or auto) ─────────────────────────────────────────

  /**
   * Shortlist top N APPLIED applications for a job by rankPosition.
   * - Only status = APPLIED
   * - Optional minimumMatchScore filter (qualified only; may return < N)
   * - auto=true → isAutoShortlisted = true
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

    const job = await this.db.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        aiConfig: {
          select: {
            enableAutoShortlisting: true,
            shortlistLimit: true,
            minimumMatchScore: true,
          },
        },
        jobProcessing: {
          select: { status: true, currentTask: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    // Auto path: ranking must be ready (wait rule)
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

    await this.db.application.updateMany({
      where: {
        id: { in: ids },
        status: ApplicationStatus.APPLIED, // race-safe
      },
      data: {
        status: ApplicationStatus.SHORTLISTED,
        isAutoShortlisted: isAuto,
      },
    });

    this.logger.log(
      `Shortlisted ${ids.length}/${count} for job ${jobId} (auto=${isAuto})`,
    );

    // Optional: write status history here later
    // await this.recordStatusChanges(ids, APPLIED → SHORTLISTED, opts)

    return {
      jobId,
      requested: count,
      shortlisted: ids.length,
      applicationIds: ids,
    };
  }

  /**
   * Auto shortlist driven by JobAiConfig after deadline close.
   * Uses shortlistLimit; no-ops if auto disabled or limit missing.
   */
  async runAutoShortlistForJob(jobId: string): Promise<ShortlistTopResult> {
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
      actorUserId: null,
    });
  }

  // ─── Single application ─────────────────────────────────────────────

  async shortlistOne(
    applicationId: string,
    companyId: string,
    opts: ShortlistOptions = {},
  ) {
    this.assertUuid(applicationId, 'applicationId');
    const app = await this.findOwnedApplication(applicationId, companyId);

    if (app.status === ApplicationStatus.SHORTLISTED) {
      return app; // idempotent
    }

    if (app.status !== ApplicationStatus.APPLIED) {
      throw new BadRequestException(
        `Cannot shortlist application in status ${app.status}`,
      );
    }

    return this.db.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.SHORTLISTED,
        isAutoShortlisted: !!opts.auto,
      },
      select: {
        id: true,
        status: true,
        isAutoShortlisted: true,
        rankPosition: true,
        matchScore: true,
      },
    });
  }

  /**
   * Unshortlist → back to APPLIED.
   * isAutoShortlisted is PRESERVED (fairness / audit history).
   */
  async unshortlistOne(
    applicationId: string,
    companyId: string,
    opts: { actorUserId?: string | null; reason?: string } = {},
  ) {
    this.assertUuid(applicationId, 'applicationId');
    const app = await this.findOwnedApplication(applicationId, companyId);

    if (app.status !== ApplicationStatus.SHORTLISTED) {
      throw new BadRequestException(
        `Only SHORTLISTED applications can be unshortlisted (current: ${app.status})`,
      );
    }

    const updated = await this.db.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.APPLIED,
        // isAutoShortlisted intentionally NOT cleared
      },
      select: {
        id: true,
        status: true,
        isAutoShortlisted: true,
        rankPosition: true,
        matchScore: true,
      },
    });

    this.logger.log(
      `Unshortlisted application ${applicationId} by ${opts.actorUserId ?? 'system'}` +
        (opts.reason ? ` reason=${opts.reason}` : '') +
        (app.isAutoShortlisted ? ' [was auto-shortlisted]' : ''),
    );

    return updated;
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  async isRankingReady(jobId: string): Promise<boolean> {
    const jp = await this.db.jobProcessing.findUnique({
      where: { jobId },
      select: { status: true },
    });
    if (!jp) return false;

    // Pipeline finished ranking (COMPLETED), OR at least some ranks exist
    if (jp.status === ProcessingStatus.COMPLETED) return true;

    const rankedCount = await this.db.application.count({
      where: { jobId, rankPosition: { not: null } },
    });
    return rankedCount > 0;
  }

  /**
   * Stronger check: at least one application has rankPosition set.
   * Prefer this for auto shortlist "wait" rule.
   */
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

  private assertUuid(value: string, field: string) {
    if (!isUUID(value)) {
      throw new BadRequestException(`${field} must be a valid UUID`);
    }
  }
}
