// Mirrors FastAPI's pydantic models (app/models/ranking.py, job.py, resume.py)

export interface JobRequirementsPayload {
  title?: string;
  required_skills: string[];
  qualifications: string[];
  description: string;
}

// Mirrors ResumeData — resume.parsedData is stored in this exact shape
// by the resume parser, so it's passed through with minimal reshaping.
export interface ResumeDataPayload {
  basics: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    headline?: string;
    summary?: string;
  };
  skills: { name?: string; category?: string }[];
  education: {
    degree?: string;
    field?: string;
    institution?: string;
    startDate?: string;
    endDate?: string;
    grade?: string;
  }[];
  experience: {
    title?: string;
    company?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    durationMonths?: number | null;
    description?: string;
    technologies?: string[];
  }[];
  projects?: unknown[];
  certifications?: unknown[];
  interests?: string[];
  meta?: Record<string, unknown>;
}

export interface RankApiRequest {
  job: JobRequirementsPayload;
  resume: ResumeDataPayload;
}

export interface FieldScores {
  skills_score: number | null;
  experience_score: number | null;
  education_score: number | null;
  matched_skills: string[];
  missing_skills: string[];
  ai_summary: string | null;
}

export interface RankApiResponse {
  candidate_name: string;
  field_scores: FieldScores;
}
