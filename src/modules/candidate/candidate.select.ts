import { Prisma } from '@prisma/client';

export const candidatePublicSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  linkedinUrl: true,
  portfolioUrl: true,
  location: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CandidateSelect;

export const candidateProfileSelect = {
  ...candidatePublicSelect,
  _count: {
    select: {
      resumes: true,
      applications: true,
    },
  },
} satisfies Prisma.CandidateSelect;

export const candidateRecruiterSelect = {
  ...candidateProfileSelect,
  resumes: {
    select: {
      id: true,
      resumeUrl: true,
      fileName: true,
      description: true,
      parsedData: true,
      extractedSkills: true,
      extractedExperience: true,
      extractedEducation: true,
      isPrimary: true,
      uploadedAt: true,
    },
    orderBy: {
      uploadedAt: 'desc',
    },
  },
  applications: {
    select: {
      id: true,
      jobId: true,
      companyId: true,
      resumeId: true,
      source: true,
      status: true,
      matchScore: true,
      rankPosition: true,
      isAutoShortlisted: true,
      appliedAt: true,
      updatedAt: true,
      job: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
    orderBy: {
      appliedAt: 'desc',
    },
  },
} satisfies Prisma.CandidateSelect;
