import { Prisma, ProcessingTaskType } from '@prisma/client';

export const applicationDetailSelect = {
  id: true,
  status: true,
  source: true,
  matchScore: true,
  rankPosition: true,
  isAutoShortlisted: true,
  appliedAt: true,
  updatedAt: true,
  companyId: true,
  job: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
  candidate: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      linkedinUrl: true,
      portfolioUrl: true,
      location: true,
    },
  },
  resume: {
    select: {
      id: true,
      resumeUrl: true,
      fileName: true,
      description: true,
      extractedSkills: true,
      extractedExperience: true,
      extractedEducation: true,
      isPrimary: true,
      uploadedAt: true,
    },
  },
  analysis: {
    where: {
      isLatest: true,
    },
    take: 1,
    select: {
      skillMatchScore: true,
      experienceScore: true,
      educationScore: true,
      overallScore: true,
      matchedSkills: true,
      missingSkills: true,
      strengths: true,
      weaknesses: true,
      aiSummary: true,
      recommendation: true,
      analyzedAt: true,
    },
  },
  processingTasks: {
    where: {
      taskType: {
        in: [
          ProcessingTaskType.RESUME_PARSE,
          ProcessingTaskType.RESUME_ANALYSIS,
        ],
      },
    },
    select: {
      taskType: true,
      status: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

export const jobApplicationsSelect = {
  id: true,
  status: true,
  source: true,
  matchScore: true,
  rankPosition: true,
  isAutoShortlisted: true,
  appliedAt: true,
  updatedAt: true,
  candidate: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      location: true,
    },
  },
  resume: {
    select: {
      id: true,
      resumeUrl: true,
      extractedEducation: true,
      extractedExperience: true,
      uploadedAt: true,
    },
  },
  analysis: {
    where: {
      isLatest: true,
    },
    select: {
      skillMatchScore: true,
      experienceScore: true,
      educationScore: true,
      overallScore: true,
      matchedSkills: true,
      missingSkills: true,
      aiSummary: true,
      recommendation: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

export const jobApplicationsListSelect = {
  id: true,
  status: true,
  source: true,
  matchScore: true,
  rankPosition: true,
  appliedAt: true,

  candidate: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
};
