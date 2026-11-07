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
