export enum ExperienceLevel {
  JUNIOR = 'JUNIOR',
  MID = 'MID',
  SENIOR = 'SENIOR',
}

/** Used by ranking. */
export interface JobRequirements {
  title?: string | null; // max 200
  requiredSkills: string[]; // max 50 items, each 1-200 chars
  qualifications: string[]; // max 50 items, each 1-1000 chars
  description?: string | null; // max 5000
}

/** Used by question generation and evaluation. */
export interface JobContext {
  title?: string | null; // max 200
  description?: string | null; // max 5000
  requiredSkills?: string[]; // max 50 items
  experienceLevel?: ExperienceLevel | null;
}
