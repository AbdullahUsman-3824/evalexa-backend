import { InterviewQuestionCategory } from '@prisma/client';

export interface QuestionResponse {
  success: boolean;
  data: {
    interviewId: string;
    question: {
      id: string;
      order: number;
      category: InterviewQuestionCategory;
      questionText: string;
    } | null;
    isCompleted: boolean;
  };
}
