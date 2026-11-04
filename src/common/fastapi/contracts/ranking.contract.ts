import { JobRequirements } from './job.contract';
import { ResumeDataInput } from './resume.contract';

export interface RankRequest {
  job: JobRequirements;
  resume: ResumeDataInput;
}

export interface FieldScores {
  skillsScore: number | null; // 0 to 100
  experienceScore: number | null; // 0 to 100
  educationScore: number | null; // 0 to 100
  matchedSkills: string[];
  missingSkills: string[];
  aiSummary: string | null;
}

export interface RankResponse {
  candidateName: string;
  fieldScores: FieldScores;
}
