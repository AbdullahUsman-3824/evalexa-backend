import { Prisma } from '@prisma/client';

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
} satisfies Prisma.ApplicationSelect;
