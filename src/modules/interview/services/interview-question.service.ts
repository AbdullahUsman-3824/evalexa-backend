import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InterviewQuestionCategory, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';
import { FastApiService } from '../../../common/fastapi/fastapi.service';
import { ExperienceLevel as FastApiExperienceLevel } from '../../../common/fastapi/contracts';
import type {
  GeneratedQuestion,
  JobContext,
  QuestionGenerationResponse,
} from '../../../common/fastapi/contracts';
import { ExperienceLevel } from '@prisma/client';

const QUESTION_PLAN = {
  conceptual: 6,
  scenarioPractical: 4,
} as const;

@Injectable()
export class InterviewQuestionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly fastApi: FastApiService,
  ) {}

  async generateQuestions(interviewId: string) {
    const interview = await this.db.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        language: true,
        application: {
          select: {
            job: {
              select: {
                title: true,
                description: true,
                experienceLevel: true,
                jobSkills: {
                  where: { importance: 'REQUIRED' },
                  select: {
                    skill: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    const existingCount = await this.db.interviewQuestion.count({
      where: { interviewId },
    });
    const expected = QUESTION_PLAN.conceptual + QUESTION_PLAN.scenarioPractical;

    if (existingCount === expected) {
      const questions = await this.db.interviewQuestion.findMany({
        where: { interviewId },
        orderBy: { order: 'asc' },
        include: { criteria: true },
      });
      return {
        interviewId,
        totalQuestions: existingCount,
        questions,
      };
    }

    const response = await this.fastApi.generateQuestions({
      interviewId: interview.id,
      job: this.buildJobContext(interview.application.job),
      questionPlan: QUESTION_PLAN,
      language: interview.language === 'ur' ? 'ur' : 'en',
    });

    this.validateResponse(response, interview.id);

    await this.db.$transaction(
      async (tx) => {
        await this.replaceQuestions(tx, interview.id, response.questions);
      },
      {
        maxWait: 15_000,
        timeout: 30_000,
      },
    );

    return {
      interviewId: interview.id,
      totalQuestions: response.totalQuestions,
      questions: response.questions,
    };
  }

  private buildJobContext(job: {
    title: string;
    description: string;
    experienceLevel: ExperienceLevel;
    jobSkills: { skill: { name: string } }[];
  }): JobContext {
    const experienceLevel: FastApiExperienceLevel | null =
      {
        INTERN: FastApiExperienceLevel.JUNIOR,
        JUNIOR: FastApiExperienceLevel.JUNIOR,
        MID: FastApiExperienceLevel.MID,
        SENIOR: FastApiExperienceLevel.SENIOR,
        LEAD: FastApiExperienceLevel.SENIOR,
      }[job.experienceLevel] ?? null;

    return {
      title: job.title,
      description: job.description,
      requiredSkills: job.jobSkills.map(({ skill }) => skill.name),
      experienceLevel,
    };
  }

  private validateResponse(
    response: QuestionGenerationResponse,
    interviewId: string,
  ): void {
    if (
      response.interviewId !== interviewId ||
      response.totalQuestions !== response.questions.length ||
      response.questions.length !==
        QUESTION_PLAN.conceptual + QUESTION_PLAN.scenarioPractical
    ) {
      throw new BadRequestException('Invalid question generation response');
    }

    for (const question of response.questions) {
      if (
        !Number.isInteger(question.order) ||
        question.order < 1 ||
        !Object.values(InterviewQuestionCategory).includes(question.category) ||
        !question.questionText ||
        !question.referenceAnswer ||
        !Array.isArray(question.evaluationRubric) ||
        question.evaluationRubric.length === 0 ||
        question.maxScore !==
          question.evaluationRubric.reduce(
            (total, criterion) => total + criterion.maxScore,
            0,
          )
      ) {
        throw new BadRequestException('Invalid question generation response');
      }
    }
  }

  private async replaceQuestions(
    tx: Prisma.TransactionClient,
    interviewId: string,
    questions: GeneratedQuestion[],
  ): Promise<void> {
    await tx.interviewQuestion.deleteMany({
      where: { interviewId },
    });

    const createdQuestions = await Promise.all(
      questions.map((question) =>
        tx.interviewQuestion.create({
          data: {
            interviewId,
            order: question.order,
            category: question.category,
            questionText: question.questionText,
            referenceAnswer: question.referenceAnswer,
            maxScore: question.maxScore,
          },
          select: { id: true, order: true },
        }),
      ),
    );

    const byOrder = new Map(
      createdQuestions.map((q) => [q.order, q.id] as const),
    );

    const criteriaRows = questions.flatMap((question) => {
      const questionId = byOrder.get(question.order);
      if (!questionId) {
        throw new BadRequestException(
          `Missing created question for order ${question.order}`,
        );
      }
      return question.evaluationRubric.map((criterion) => ({
        questionId,
        criterion: criterion.criterion,
        description: criterion.description,
        maxScore: criterion.maxScore,
      }));
    });

    if (criteriaRows.length > 0) {
      await tx.interviewQuestionCriterion.createMany({
        data: criteriaRows,
      });
    }
  }
}
