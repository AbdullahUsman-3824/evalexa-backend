import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MatchRecommendation, SkillImportance } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { FASTAPI_ENDPOINTS } from '../constants/fastapi.constants';
import {
  RANKING_WEIGHTS,
  RECOMMENDATION_THRESHOLDS,
  EDUCATION_QUALIFICATION_TEXT,
  EXPERIENCE_QUALIFICATION_TEXT,
} from './ranking.constants';
import {
  RankApiRequest,
  RankApiResponse,
  FieldScores,
  JobRequirementsPayload,
  ResumeDataPayload,
} from './ranking-api.interface';

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly http: HttpService,
  ) {}

  private buildJobPayload(job: {
    description: string;
    responsibilities: string;
    educationLevel: keyof typeof EDUCATION_QUALIFICATION_TEXT;
    experienceLevel: keyof typeof EXPERIENCE_QUALIFICATION_TEXT;
    jobSkills: { importance: SkillImportance; skill: { name: string } }[];
  }): JobRequirementsPayload {
    const requiredSkills = job.jobSkills
      .filter((js) => js.importance === SkillImportance.REQUIRED)
      .map((js) => js.skill.name);

    return {
      required_skills: requiredSkills,
      responsibilities: job.responsibilities,
      qualifications: [
        EDUCATION_QUALIFICATION_TEXT[job.educationLevel],
        EXPERIENCE_QUALIFICATION_TEXT[job.experienceLevel],
      ],
      description: job.description,
    };
  }

  private buildResumePayload(parsedData: unknown): ResumeDataPayload {
    // Verified: Resume.parsedData is stored as ParsedResumeData
    // (resume-parser.service.ts), which matches FastAPI's ResumeData
    // shape field-for-field. Direct pass-through, no remap needed.
    return parsedData as ResumeDataPayload;
  }

  private computeOverallScore(fieldScores: FieldScores): number {
    return (
      RANKING_WEIGHTS.skills * fieldScores.skills_score +
      RANKING_WEIGHTS.experience * fieldScores.experience_score +
      RANKING_WEIGHTS.education * fieldScores.education_score
    );
  }

  private mapToRecommendation(overallScore0to1: number): MatchRecommendation {
    const match = RECOMMENDATION_THRESHOLDS.find(
      (t) => overallScore0to1 >= t.min,
    );
    return match?.label ?? MatchRecommendation.WEAK_MATCH;
  }

  private async callRankingApi(
    payload: RankApiRequest,
  ): Promise<RankApiResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<RankApiResponse>(
          FASTAPI_ENDPOINTS.RANKING.RANK,
          payload,
        ),
      );
      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `Failed to score resume against job: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Scores a single application against its job, persists a new
   * ResumeAnalysis row, and updates Application.matchScore.
   * Returns the jobId so the caller can trigger a re-rank for that job.
   */
  async scoreApplication(
    applicationId: string,
  ): Promise<{ jobId: string } | null> {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        jobId: true,
        resume: { select: { parsedData: true } },
        job: {
          select: {
            description: true,
            responsibilities: true,
            educationLevel: true,
            experienceLevel: true,
            jobSkills: {
              select: { importance: true, skill: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!application) {
      this.logger.warn(
        `scoreApplication: application ${applicationId} not found`,
      );
      return null;
    }

    if (!application.resume.parsedData) {
      this.logger.warn(
        `scoreApplication: application ${applicationId} has no parsed resume data`,
      );
      return null;
    }

    const payload: RankApiRequest = {
      job: this.buildJobPayload(application.job),
      resume: this.buildResumePayload(application.resume.parsedData),
    };

    const { field_scores } = await this.callRankingApi(payload);

    const overallScore0to1 = this.computeOverallScore(field_scores);
    const recommendation = this.mapToRecommendation(overallScore0to1);
    const matchScorePercent = Math.round(overallScore0to1 * 100);

    await this.db.$transaction(async (tx) => {
      await tx.resumeAnalysis.updateMany({
        where: { applicationId, isLatest: true },
        data: { isLatest: false },
      });

      const lastAnalysis = await tx.resumeAnalysis.findFirst({
        where: { applicationId },
        orderBy: { analysisVersion: 'desc' },
        select: { analysisVersion: true },
      });

      await tx.resumeAnalysis.create({
        data: {
          applicationId,
          jobId: application.jobId,
          skillMatchScore: Math.round(field_scores.skills_score * 100),
          experienceScore: Math.round(field_scores.experience_score * 100),
          educationScore: Math.round(field_scores.education_score * 100),
          overallScore: matchScorePercent,
          recommendation,
          analysisVersion: (lastAnalysis?.analysisVersion ?? 0) + 1,
          isLatest: true,
        },
      });

      await tx.application.update({
        where: { id: applicationId },
        data: { matchScore: matchScorePercent },
      });
    });

    return { jobId: application.jobId };
  }

  /**
   * Recomputes rankPosition for every application under a job,
   * ordered by matchScore descending (nulls last, i.e. unscored last).
   */
  async recalculateRanksForJob(jobId: string): Promise<void> {
    const applications = await this.db.application.findMany({
      where: { jobId },
      orderBy: [{ matchScore: 'desc' }],
      select: { id: true, matchScore: true },
    });

    await this.db.$transaction(
      applications.map((app, index) =>
        this.db.application.update({
          where: { id: app.id },
          data: { rankPosition: index + 1 },
        }),
      ),
    );
  }

  /**
   * Entry point: score one application, then re-rank the whole job.
   * Not meant to be awaited by the caller's response — failures are
   * logged, never thrown, since nothing downstream is waiting on this.
   */
  async scoreAndRankApplication(applicationId: string): Promise<void> {
    try {
      const result = await this.scoreApplication(applicationId);
      if (!result) return;
      await this.recalculateRanksForJob(result.jobId);
    } catch (error) {
      this.logger.error(
        `Ranking failed for application ${applicationId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
