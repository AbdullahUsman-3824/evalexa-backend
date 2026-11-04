export interface ResumeBasics {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  headline: string;
  summary: string;
}

export interface ResumeSkillItem {
  name: string;
  category: string;
}

export interface ResumeEducation {
  degree: string;
  field: string;
  institution: string;
  startDate: string; // YYYY-MM
  endDate: string;
  grade: string;
}

export interface ResumeExperience {
  title: string;
  company: string;
  startDate: string; // YYYY-MM
  endDate: string;
  isCurrent: boolean;
  durationMonths: number | null;
  description: string;
  technologies: string[];
}

export interface ResumeProject {
  name: string;
  description: string;
  technologies: string[];
  url: string;
}

export interface ResumeCertification {
  name: string;
  issuer: string;
  year: string;
}

export interface ResumeMeta {
  totalExperienceMonths: number | null;
  parserVersion: string;
  confidenceScore: number | null; // 0 to 1
}

/** Shape returned by the parser (all fields present). */
export interface ResumeData {
  basics: ResumeBasics;
  skills: ResumeSkillItem[];
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  certifications: ResumeCertification[];
  interests: string[];
  meta: ResumeMeta;
}

type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> | null }
    : T;

/** When you SEND a resume to FastAPI, every field is optional (server fills defaults). */
export type ResumeDataInput = DeepPartial<ResumeData>;

export interface ResumeParseResponse {
  data: ResumeData;
}
