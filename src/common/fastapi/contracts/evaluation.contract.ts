import { JobContext } from './job.contract';
import { EvaluationCriterion, QuestionCategory } from './questions.contract';

export enum AnswerEvaluationStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  NO_ANSWER = 'NO_ANSWER',
  UNINTELLIGIBLE = 'UNINTELLIGIBLE',
}

export enum InterviewEvaluationStatus {
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  FAILED = 'FAILED',
}

export interface AnswerToEvaluate {
  order: number; // >= 1
  questionId: string; // 3-128 chars: letters, digits, _ and -
  category: QuestionCategory;
  questionText: string;
  referenceAnswer: string;
  evaluationRubric: EvaluationCriterion[]; // 1 to 10 items
  maxScore: number; // must equal sum of rubric maxScore
  transcript?: string | null; // null, '' or whitespace means NO_ANSWER. max 8000
}

export interface EvaluationRequest {
  interviewId: string;
  job?: JobContext;
  answers: AnswerToEvaluate[]; // 1 to 50 items, unique questionId
}

export interface CriterionResult {
  criterion: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface AnswerEvaluationResult {
  questionId: string;
  order: number;
  status: AnswerEvaluationStatus;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  criteria: CriterionResult[];
  strengths: string[];
  improvements: string[];
  feedback: string;
}

export interface EvaluationResponse {
  interviewId: string;
  status: InterviewEvaluationStatus;
  totalQuestions: number;
  evaluatedQuestions: number;
  failedQuestions: number;
  overallScore: number | null;
  overallMaxScore: number | null;
  overallPercentage: number | null;
  overallFeedback: string;
  results: AnswerEvaluationResult[];
}