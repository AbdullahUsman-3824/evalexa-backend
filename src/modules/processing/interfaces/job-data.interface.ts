export interface ApplicationTaskJobData {
  applicationId: string;
  jobId: string;
  jobProcessingId: string;
  taskId: string;
}

export interface JobWideTaskJobData {
  jobId: string;
  jobProcessingId: string;
}

export interface QuestionGenerationJobData {
  interviewId: string;
}

export interface AnswerTranscriptionJobData {
  interviewId: string;
  questionId: string;
}

export interface AnswerEvaluationJobData {
  interviewId: string;
  questionId: string;
}
