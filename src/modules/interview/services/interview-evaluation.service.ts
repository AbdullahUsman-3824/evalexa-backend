import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AnswerEvaluationStatus,
  EvaluationResponse,
  QuestionCategory,
} from '../../../common/fastapi/contracts';
import { FastApiService } from '../../../common/fastapi/fastapi.service';
import { DatabaseService } from '../../../database/database.service';
import {
  AnswerTranscriptionStatus,
  EvaluationStatus,
  InterviewRecommendation,
} from '@prisma/client';
  
@Injectable()
export class InterviewEvaluationService {
  private readonly logger = new Logger(InterviewEvaluationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly fastApi: FastApiService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Evaluate a single answer
  // ─────────────────────────────────────────────────────────────────────────────

  async evaluateAnswer(interviewId: string, questionId: string) {
    // Fetch everything needed to build the EvaluationRequest
    const question = await this.db.interviewQuestion.findFirst({
      where: { id: questionId, interviewId },
      select: {
        id: true,
        order: true,
        category: true,
        questionText: true,
        referenceAnswer: true,
        maxScore: true,
        criteria: {
          select: {
            id: true,
            criterion: true,
            description: true,
            maxScore: true,
          },
        },
        answer: {
          select: {
            id: true,
            answerText: true,
            transcriptionStatus: true,
            evaluation: {
              select: { id: true, status: true },
            },
          },
        },
      },
    });

    if (!question) {
      throw new NotFoundException('Interview question not found');
    }
    if (!question.answer) {
      throw new BadRequestException('No answer exists for this question yet');
    }
    if (
      question.answer.transcriptionStatus ===
        AnswerTranscriptionStatus.PENDING ||
      question.answer.transcriptionStatus ===
        AnswerTranscriptionStatus.PROCESSING
    ) {
      throw new BadRequestException(
        'Answer transcription has not completed yet',
      );
    }
    if (question.answer.evaluation?.status === EvaluationStatus.PROCESSING) {
      throw new ConflictException('Answer evaluation is already in progress');
    }
    if (question.criteria.length === 0) {
      throw new BadRequestException(
        'Question has no evaluation criteria defined',
      );
    }

    // Optimistic lock: claim the evaluation slot
    if (question.answer.evaluation) {
      const claimed = await this.db.interviewAnswerEvaluation.updateMany({
        where: {
          id: question.answer.evaluation.id,
          status: { not: EvaluationStatus.PROCESSING },
        },
        data: { status: EvaluationStatus.PROCESSING },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Answer evaluation is already in progress');
      }
    } else {
      await this.db.interviewAnswerEvaluation.create({
        data: {
          answerId: question.answer.id,
          status: EvaluationStatus.PROCESSING,
        },
      });
    }

    // Build the FastAPI request payload
    const evaluationRequest = {
      answer: {
        order: question.order,
        questionId: question.id,
        category: question.category as QuestionCategory,
        questionText: question.questionText,
        referenceAnswer: question.referenceAnswer,
        evaluationRubric: question.criteria.map((c) => ({
          criterion: c.criterion,
          description: c.description,
          maxScore: c.maxScore.toNumber(),
        })),
        maxScore: question.maxScore.toNumber(),
        transcript: question.answer.answerText ?? null,
      },
    };

    // Call FastAPI
    let response: EvaluationResponse;
    try {
      response = await this.fastApi.evaluate(evaluationRequest);
    } catch (error) {
      await this.db.interviewAnswerEvaluation.update({
        where: { answerId: question.answer.id },
        data: { status: EvaluationStatus.FAILED },
      });
      throw error;
    }

    const result = response.result;

    if (!result || result.questionId !== question.id) {
      await this.db.interviewAnswerEvaluation.update({
        where: { answerId: question.answer.id },
        data: { status: EvaluationStatus.FAILED },
      });
      throw new BadRequestException('Invalid evaluation response from FastAPI');
    }

    // Map FastAPI criterion results back to DB criterion IDs
    // The contract guarantees criterion names are unique within a question (case-insensitive)
    const criterionByName = new Map(
      question.criteria.map((c) => [c.criterion.toLowerCase(), c.id]),
    );

    const now = new Date();
    const dbStatus = this.toDbEvaluationStatus(result.status);

    // Persist evaluation result + per-criterion results atomically
    await this.db.$transaction(async (tx) => {
      const evaluation = await tx.interviewAnswerEvaluation.update({
        where: { answerId: question.answer!.id },
        data: {
          status: dbStatus,
          score: result.score,
          maxScore: result.maxScore,
          percentage: result.percentage,
          strengths: result.strengths,
          improvements: result.improvements,
          feedback: result.feedback ?? null,
          evaluatedAt: now,
        },
        select: { id: true },
      });

      if (result.criteria?.length) {
        // Delete any stale criterion results before inserting fresh ones
        await tx.interviewCriterionResult.deleteMany({
          where: { evaluationId: evaluation.id },
        });

        const criterionRows = result.criteria
          .map((cr) => {
            const criterionId = criterionByName.get(cr.criterion.toLowerCase());
            if (!criterionId) {
              this.logger.warn(
                `Criterion "${cr.criterion}" from FastAPI response not found in DB for question ${question.id}`,
              );
              return null;
            }
            return {
              evaluationId: evaluation.id,
              criterionId,
              score: cr.score,
              maxScore: cr.maxScore,
              reason: cr.reason,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (criterionRows.length) {
          await tx.interviewCriterionResult.createMany({
            data: criterionRows,
          });
        }
      }
    });

    // Update the interview-level evaluation status
    const interviewStatus =
      await this.getInterviewEvaluationStatus(interviewId);
    const updateData: Parameters<typeof this.db.interview.update>[0]['data'] = {
      evaluationStatus: interviewStatus,
    };
    if (interviewStatus === EvaluationStatus.COMPLETED) {
      const summary = await this.computeInterviewSummary(interviewId);
      updateData.overallScore = summary.overallScore;
      updateData.overallMaxScore = summary.overallMaxScore;
      updateData.overallPercentage = summary.overallPercentage;
      updateData.overallFeedback = null; // populated separately if needed
      updateData.recommendation = this.toRecommendation(
        summary.overallPercentage,
      );
      updateData.evaluatedAt = new Date();
    }
    await this.db.interview.update({
      where: { id: interviewId },
      data: updateData,
    });

    return {
      success: true,
      data: {
        interviewId,
        questionId: question.id,
        status: result.status,
        score: result.score,
        maxScore: result.maxScore,
        percentage: result.percentage,
        strengths: result.strengths,
        improvements: result.improvements,
        feedback: result.feedback,
        criteria: result.criteria,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Maps FastAPI AnswerEvaluationStatus to Prisma EvaluationStatus.
   * NO_ANSWER and UNINTELLIGIBLE are still considered a completed evaluation run.
   */
  private toDbEvaluationStatus(
    status: AnswerEvaluationStatus,
  ): EvaluationStatus {
    if (status === AnswerEvaluationStatus.FAILED) {
      return EvaluationStatus.FAILED;
    }
    return EvaluationStatus.COMPLETED;
  }

  /**
   * Derives the interview-level EvaluationStatus by aggregating all answers.
   */
  private async getInterviewEvaluationStatus(
    interviewId: string,
  ): Promise<EvaluationStatus> {
    const evaluations = await this.db.interviewAnswerEvaluation.findMany({
      where: { answer: { question: { interviewId } } },
      select: { status: true },
    });

    if (evaluations.length === 0) return EvaluationStatus.PENDING;

    const statuses = evaluations.map((e) => e.status);

    if (statuses.includes(EvaluationStatus.PROCESSING)) {
      return EvaluationStatus.PROCESSING;
    }
    if (statuses.includes(EvaluationStatus.PENDING)) {
      return EvaluationStatus.PROCESSING;
    }

    const completed = statuses.filter(
      (s) => s === EvaluationStatus.COMPLETED,
    ).length;
    const failed = statuses.length - completed;

    if (failed === 0) return EvaluationStatus.COMPLETED;
    if (completed === 0) return EvaluationStatus.FAILED;
    return EvaluationStatus.PARTIALLY_COMPLETED;
  }

  /**
   * Sums scores across all completed answer evaluations for the interview.
   */
  private async computeInterviewSummary(interviewId: string) {
    const evaluations = await this.db.interviewAnswerEvaluation.findMany({
      where: {
        answer: { question: { interviewId } },
        status: EvaluationStatus.COMPLETED,
        score: { not: null },
      },
      select: { score: true, maxScore: true },
    });

    const overallScore = evaluations.reduce(
      (sum, e) => sum + (e.score?.toNumber() ?? 0),
      0,
    );
    const overallMaxScore = evaluations.reduce(
      (sum, e) => sum + (e.maxScore?.toNumber() ?? 0),
      0,
    );
    const overallPercentage =
      overallMaxScore > 0
        ? Math.round((overallScore / overallMaxScore) * 10000) / 100
        : 0;

    return { overallScore, overallMaxScore, overallPercentage };
  }

  /**
   * Converts a percentage score to a recommendation bucket.
   */
  private toRecommendation(percentage: number): InterviewRecommendation {
    if (percentage >= 85) return InterviewRecommendation.STRONGLY_RECOMMENDED;
    if (percentage >= 70) return InterviewRecommendation.RECOMMENDED;
    if (percentage >= 50) return InterviewRecommendation.NEUTRAL;
    if (percentage >= 30) return InterviewRecommendation.NOT_RECOMMENDED;
    return InterviewRecommendation.STRONGLY_NOT_RECOMMENDED;
  }
}
