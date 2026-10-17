import { Injectable, Logger } from '@nestjs/common';
import { ProcessingTaskType } from '@prisma/client';
import { ProcessingTaskService } from './processing-task.service';
import { JobProcessingService } from './job-processing.service';
import { DatabaseService } from '../../../database/database.service';
import { ResumeParserService } from '../../resume/resume-parser.service';
import { ResumeService } from '../../resume/resume.service';
import { CandidateService } from '../../candidate/candidate.service';
import { RankingService } from '../../ranking/ranking.service';
import { ShortlistingService } from '../../application/shortlisting.service';
import { QStashService } from '../../../qstash/qstash.service';
import {
  ApplicationTaskJobData,
  JobWideTaskJobData,
} from '../interfaces/job-data.interface';
import { JobStatus, ProcessingStatus } from '@prisma/client';

@Injectable()
export class ProcessingExecutorService {
  private readonly logger = new Logger(ProcessingExecutorService.name);

  constructor(
    private readonly taskService: ProcessingTaskService,
    private readonly jobProcessingService: JobProcessingService,
    private readonly db: DatabaseService,
    private readonly resumeParser: ResumeParserService,
    private readonly resumeService: ResumeService,
    private readonly candidateService: CandidateService,
    private readonly rankingService: RankingService,
    private readonly shortlistingService: ShortlistingService,
    private readonly qstash: QStashService,
  ) {}

  /**
   * Transient errors should be retried by BullMQ / QStash.
   * Permanent business errors should not.
   */
  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return true;

    const msg = error.message.toLowerCase();

    // Permanent – do not retry
    if (
      msg.includes('not found') ||
      msg.includes('not yet parsed') ||
      msg.includes('application or resume file not found')
    ) {
      return false;
    }

    // Network / HTTP 5xx style – retry
    const anyErr = error as any;
    if (
      anyErr.code &&
      [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EAI_AGAIN',
      ].includes(anyErr.code)
    ) {
      return true;
    }
    if (anyErr.response?.status >= 500) return true;
    if (anyErr.status >= 500) return true;

    // Default: treat unexpected errors as transient so queue can retry
    return true;
  }

  // ==================== RESUME PARSE ====================
  async runResumeParse(data: ApplicationTaskJobData) {
    const { applicationId, jobId, jobProcessingId, taskId } = data;

    await this.taskService.markRunning(taskId);

    try {
      const application = await this.db.application.findUnique({
        where: { id: applicationId },
        include: {
          resume: {
            select: {
              id: true,
              resumeUrl: true,
              fileName: true,
              candidateId: true,
            },
          },
        },
      });

      if (!application?.resume?.resumeUrl) {
        throw new Error('Application or resume file not found');
      }

      const { resume } = application;

      const parsed = await this.resumeParser.parseResume(
        resume.resumeUrl,
        resume.fileName ?? undefined,
      );

      await this.resumeService.saveParsedData(resume.id, parsed);

      const email = parsed.basics?.email?.trim().toLowerCase() || undefined;
      const fullName =
        parsed.basics?.fullName?.trim() ||
        resume.fileName?.replace(/\.[^.]+$/, '') ||
        'Unknown Candidate';

      await this.candidateService.updateCandidate(resume.candidateId, {
        fullName,
        ...(email ? { email } : {}),
        phone: parsed.basics?.phone || undefined,
        location: parsed.basics?.location || undefined,
      });

      await this.taskService.markCompleted(taskId);

      // Chain → resume-analysis
      const analysisTask = await this.taskService.createApplicationTask(
        jobProcessingId,
        applicationId,
        ProcessingTaskType.RESUME_ANALYSIS,
      );

      await this.qstash.addResumeAnalysis({
        applicationId,
        jobId,
        jobProcessingId,
        taskId: analysisTask.id,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Resume parse failed for ${applicationId}: ${
          error instanceof Error ? error.message : error
        }`,
      );

      await this.taskService.markFailed(taskId, error);

      // Transient → rethrow so BullMQ / QStash retries (do NOT touch counters yet)
      if (this.isTransientError(error)) {
        throw error;
      }

      // Permanent failure → count it and possibly trigger ranking
      const { allDone, processed } =
        await this.jobProcessingService.markApplicationDone(jobId, false);

      if (allDone) {
        const claimed = await this.jobProcessingService.claimRanking(jobId);
        if (claimed) {
          if (processed === 0) {
            await this.jobProcessingService.markJobWideNoSuccessfulApplications(
              jobId,
            );
          } else {
            await this.qstash.addRanking({ jobId, jobProcessingId });
          }
        }
      }

      return { success: false };
    }
  }

  // ==================== RESUME ANALYSIS ====================
  async runResumeAnalysis(data: ApplicationTaskJobData) {
    const { applicationId, jobId, jobProcessingId, taskId } = data;

    await this.taskService.markRunning(taskId);

    try {
      const result = await this.rankingService.scoreApplication(applicationId);
      if (!result) {
        throw new Error('Application not found or resume not yet parsed');
      }
      await this.taskService.markCompleted(taskId);

      const {
        allDone,
        processed,
        jobProcessingId: jpId,
      } = await this.jobProcessingService.markApplicationDone(jobId, true);

      if (allDone) {
        const claimed = await this.jobProcessingService.claimRanking(jobId);
        if (claimed) {
          if (processed === 0) {
            await this.jobProcessingService.markJobWideNoSuccessfulApplications(
              jobId,
            );
          } else {
            await this.qstash.addRanking({
              jobId,
              jobProcessingId: jpId || jobProcessingId,
            });
          }
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Resume analysis failed for ${applicationId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      await this.taskService.markFailed(taskId, error);

      // Transient → rethrow so queue retries (counters untouched)
      if (this.isTransientError(error)) {
        throw error;
      }

      // Permanent failure
      const {
        allDone,
        processed,
        jobProcessingId: jpId,
      } = await this.jobProcessingService.markApplicationDone(jobId, false);

      if (allDone) {
        const claimed = await this.jobProcessingService.claimRanking(jobId);
        if (claimed) {
          if (processed === 0) {
            await this.jobProcessingService.markJobWideNoSuccessfulApplications(
              jobId,
            );
          } else {
            await this.qstash.addRanking({
              jobId,
              jobProcessingId: jpId || jobProcessingId,
            });
          }
        }
      }

      return { success: false };
    }
  }

  // ==================== RANKING ====================
  async runRanking(data: JobWideTaskJobData) {
    const { jobId, jobProcessingId } = data;

    await this.jobProcessingService.setCurrentTask(
      jobId,
      ProcessingTaskType.RANKING,
    );

    const task = await this.taskService.createJobTask(
      jobProcessingId,
      ProcessingTaskType.RANKING,
    );
    await this.taskService.markRunning(task.id);

    try {
      await this.rankingService.recalculateRanksForJob(jobId);
      await this.taskService.markCompleted(task.id);

      // P0-1 fix: mark job-wide processing COMPLETED after ranking
      await this.jobProcessingService.markJobWideComplete(jobId);

      return { success: true };
    } catch (error) {
      await this.taskService.markFailed(task.id, error);
      await this.jobProcessingService.markJobWideFailed(jobId, error);
      throw error;
    }
  }

  // ==================== CLOSE JOB (Deadline) ====================
  async runCloseJob(data: { jobId: string }) {
    const { jobId } = data;

    const row = await this.db.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        applicationDeadline: true,
        aiConfig: {
          select: {
            enableAutoShortlisting: true,
            shortlistLimit: true,
            minimumMatchScore: true,
          },
        },
        jobProcessing: { select: { status: true } },
      },
    });

    if (!row) {
      this.logger.warn(`Job ${jobId} not found — skipping`);
      return { closed: false, reason: 'NOT_FOUND' };
    }

    // Idempotent close
    if (row.status === JobStatus.OPEN) {
      await this.db.job.update({
        where: { id: jobId },
        data: { status: JobStatus.CLOSED },
      });
      this.logger.log(`Closed job ${jobId} (deadline reached)`);
    }

    if (!row.aiConfig?.enableAutoShortlisting) {
      return { closed: true, shortlisted: 0, reason: 'AUTO_DISABLED' };
    }

    const processingStatus = row.jobProcessing?.status;

    // if processing already FAILED (e.g. all apps failed analysis),
    // do NOT throw RANKING_NOT_READY — that caused infinite QStash retries.
    if (processingStatus === ProcessingStatus.FAILED) {
      this.logger.warn(
        `Job ${jobId}: processing FAILED — skipping auto shortlist`,
      );
      return { closed: true, shortlisted: 0, reason: 'PROCESSING_FAILED' };
    }

    const rankingReady = await this.isRankingReady(jobId, processingStatus);

    if (!rankingReady) {
      // Still in progress or not yet ranked → let QStash / BullMQ retry
      throw new Error('RANKING_NOT_READY');
    }

    const result = await this.shortlistingService.runAutoShortlistForJob(jobId);

    this.logger.log(
      `Job ${jobId}: auto shortlisted ${result.shortlisted}/${result.requested}` +
        (result.skippedReason ? ` (${result.skippedReason})` : ''),
    );

    return result;
  }

  // ==================== SHORTLISTING ====================
  async runShortlisting(data: JobWideTaskJobData) {
    const { jobId, jobProcessingId } = data;

    await this.jobProcessingService.setCurrentTask(
      jobId,
      ProcessingTaskType.SHORTLISTING,
    );

    const task = await this.taskService.createJobTask(
      jobProcessingId,
      ProcessingTaskType.SHORTLISTING,
    );
    await this.taskService.markRunning(task.id);

    try {
      const job = await this.db.job.findUnique({
        where: { id: jobId },
        select: {
          applicationDeadline: true,
          status: true,
          aiConfig: {
            select: {
              enableAutoShortlisting: true,
              shortlistLimit: true,
              minimumMatchScore: true,
            },
          },
        },
      });

      const deadlinePassed =
        job?.applicationDeadline != null &&
        new Date(job.applicationDeadline) <= new Date();

      const shouldAutoShortlist =
        !!job?.aiConfig?.enableAutoShortlisting && deadlinePassed;

      if (shouldAutoShortlist) {
        await this.shortlistingService.runAutoShortlistForJob(jobId);
      }

      await this.taskService.markCompleted(task.id);
      await this.jobProcessingService.markJobWideComplete(jobId);

      return { success: true };
    } catch (error) {
      await this.taskService.markFailed(task.id, error);
      await this.jobProcessingService.markJobWideFailed(jobId, error);
      throw error;
    }
  }

  private async isRankingReady(
    jobId: string,
    processingStatus?: ProcessingStatus,
  ): Promise<boolean> {
    if (processingStatus === ProcessingStatus.COMPLETED) return true;
    // FAILED is handled by caller (runCloseJob) — treat as not ready here
    if (processingStatus === ProcessingStatus.FAILED) return false;

    const ranked = await this.db.application.count({
      where: { jobId, rankPosition: { not: null } },
    });
    return ranked > 0;
  }
}
