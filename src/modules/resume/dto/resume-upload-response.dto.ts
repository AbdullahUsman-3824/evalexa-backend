export interface AutofillPersonalDto {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  address: string | null;
  linkedinUrl: string | null;
}

export interface AutofillEducationDto {
  degree: string | null;
  field: string | null;
  institution: string | null;
  startDate: string | null;
  endDate: string | null;
  grade: string | null;
}

export interface AutofillExperienceDto {
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface AutofillSkillDto {
  name: string;
  category?: string;
}

export interface ResumeParsePreviewDto {
  personal: AutofillPersonalDto;
  education: AutofillEducationDto[];
  experience: AutofillExperienceDto[];
  skills: AutofillSkillDto[];
}

export interface ResumeUploadResponseDto {
  candidateId: string;
  resumeId: string;
  resumeUrl: string;
  personal: AutofillPersonalDto;
  education: AutofillEducationDto[];
  experience: AutofillExperienceDto[];
  skills: AutofillSkillDto[];
}
