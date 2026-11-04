import { JobContext } from './job.contract';

export enum QuestionCategory {
  CONCEPTUAL = 'CONCEPTUAL',
  SCENARIO_PRACTICAL = 'SCENARIO_PRACTICAL',
}

/** Add more codes here when you add languages in FastAPI. */
export type QuestionLanguage = 'en' | 'ur';

export interface QuestionPlan {
  conceptual: number; // >= 0
  scenarioPractical: number; // >= 0 (total must be 1 to 20)
}

export interface QuestionGenerationRequest {
  interviewId: string; // 3-128 chars: letters, digits, _ and -
  job: JobContext;
  questionPlan: QuestionPlan;
  language?: QuestionLanguage; // default 'en'
}

/** Shared by generation (response) and evaluation (request). */
export interface EvaluationCriterion {
  criterion: string; // 1-200 chars, unique within a question (case-insensitive)
  description: string; // 1-1000 chars
  maxScore: number; // >= 1
}

export interface GeneratedQuestion {
  order: number; // >= 1, 1-based
  category: QuestionCategory;
  questionText: string; // max 2000
  referenceAnswer: string; // max 4000
  evaluationRubric: EvaluationCriterion[]; // 1 to 10 items
  maxScore: number; // must equal sum of rubric maxScore
}

export interface QuestionGenerationResponse {
  interviewId: string;
  totalQuestions: number; // equals questions.length
  questions: GeneratedQuestion[];
}
