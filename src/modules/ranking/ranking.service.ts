import { Injectable, Logger } from '@nestjs/common';
import { MatchRecommendation, SkillImportance } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { FastApiService } from '../../common/fastapi/fastapi.service';
import type {
  RankRequest,
  FieldScores,
  JobRequirements,
  ResumeData,
} from '../../common/fastapi/contracts';
import {
  RANKING_WEIGHTS,
  RECOMMENDATION_THRESHOLDS,
  EDUCATION_QUALIFICATION_TEXT,
  EXPERIENCE_QUALIFICATION_TEXT,
} from './ranking.constants';

type JobForRanking = {
  title: string;
  description: string;
  educationLevel: keyof typeof EDUCATION_QUALIFICATION_TEXT;
  experienceLevel: keyof typeof EXPERIENCE_QUALIFICATION_TEXT;
  jobSkills: { importance: SkillImportance; skill: { name: string } }[];
};

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly fastApi: FastApiService,
  ) {}

  private buildJobPayload(job: JobForRanking): JobRequirements {
    const requiredSkills = job.jobSkills
      .filter((js) => js.importance === SkillImportance.REQUIRED)
      .map((js) => js.skill.name);

    return {
      title: job.title,
      requiredSkills,
      qualifications: [
        EDUCATION_QUALIFICATION_TEXT[job.educationLevel],
        EXPERIENCE_QUALIFICATION_TEXT[job.experienceLevel],
      ],
      description: job.description,
    };
  }

  private toRankResumePayload(parsedData: unknown): ResumeData {
    if (!this.isParsedResumeData(parsedData)) {
      throw new Error('Resume parsedData is not in ParsedResumeData shape');
    }
    return parsedData;
  }

  private isParsedResumeData(value: unknown): value is ResumeData {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<ResumeData>;
    return (
      typeof candidate.basics === 'object' &&
      candidate.basics !== null &&
      Array.isArray(candidate.skills) &&
      Array.isArray(candidate.education) &&
      Array.isArray(candidate.experience)
    );
  }

  private computeOverallScore(fieldScores: FieldScores): number {
    return (
      RANKING_WEIGHTS.skills * (fieldScores.skillsScore ?? 0) +
      RANKING_WEIGHTS.experience * (fieldScores.experienceScore ?? 0) +
      RANKING_WEIGHTS.education * (fieldScores.educationScore ?? 0)
    );
  }

  private mapToRecommendation(overallScore0to1: number): MatchRecommendation {
    const match = RECOMMENDATION_THRESHOLDS.find(
      (t) => overallScore0to1 >= t.min,
    );
    return match?.label ?? MatchRecommendation.WEAK_MATCH;
  }

  async scoreApplication(
    applicationId: string,
  ): Promise<{ jobId: string } | null> {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        resume: {
          select: {
            parsedData: true,
          },
        },
        job: {
          select: {
            title: true,
            description: true,
            educationLevel: true,
            experienceLevel: true,
            jobSkills: {
              select: {
                importance: true,
                skill: {
                  select: {
                    name: true,
                  },
                },
              },
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

    if (!application.resume?.parsedData) {
      this.logger.warn(
        `scoreApplication: application ${applicationId} has no parsed resume data`,
      );
      return null;
    }

    const payload: RankRequest = {
      job: this.buildJobPayload(application.job),
      resume: this.toRankResumePayload(application.resume.parsedData),
    };

    const { fieldScores } = await this.fastApi.rank(payload);

    const overallScore0to1 = this.computeOverallScore(fieldScores);
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
          skillMatchScore: Math.round((fieldScores.skillsScore ?? 0) * 100),
          experienceScore: Math.round((fieldScores.experienceScore ?? 0) * 100),
          educationScore: Math.round((fieldScores.educationScore ?? 0) * 100),
          overallScore: matchScorePercent,
          matchedSkills: fieldScores.matchedSkills,
          missingSkills: fieldScores.missingSkills,
          aiSummary: fieldScores.aiSummary,
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
