import {
  EducationLevel,
  ExperienceLevel,
  MatchRecommendation,
} from '@prisma/client';

export const RANKING_WEIGHTS = {
  skills: 0.5,
  experience: 0.3,
  education: 0.2,
} as const;

// Checked top-down on a 0–1 score, first match wins
export const RECOMMENDATION_THRESHOLDS: {
  min: number;
  label: MatchRecommendation;
}[] = [
  { min: 0.85, label: MatchRecommendation.STRONG_MATCH },
  { min: 0.65, label: MatchRecommendation.GOOD_MATCH },
  { min: 0.45, label: MatchRecommendation.AVERAGE_MATCH },
  { min: 0, label: MatchRecommendation.WEAK_MATCH },
];

// Text mapping since Job has no free-text "qualifications" field
export const EDUCATION_QUALIFICATION_TEXT: Record<EducationLevel, string> = {
  HIGH_SCHOOL: 'High school diploma required',
  BACHELOR: "Bachelor's degree required",
  MASTER: "Master's degree required",
  PHD: 'PhD required',
  DIPLOMA: 'Diploma required',
  ASSOCIATE: "Associate's degree required",
  ANY: 'Any education level accepted',
};

export const EXPERIENCE_QUALIFICATION_TEXT: Record<ExperienceLevel, string> = {
  JUNIOR: 'Junior level experience required',
  MID: 'Mid level experience required',
  SENIOR: 'Senior level experience required',
  LEAD: 'Lead level experience required',
  INTERN: 'Internship level experience required',
};
