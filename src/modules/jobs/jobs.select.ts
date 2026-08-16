import { Prisma } from '@prisma/client';

export const jobSelect = {
  id: true,
  companyId: true,
  createdBy: true,
  title: true,
  slug: true,
  department: true,
  description: true,
  jobType: true,
  experienceLevel: true,
  educationLevel: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  location: true,
  workModel: true,
  status: true,
  applicationDeadline: true,
  totalOpenings: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      id: true,
      name: true,
      logo: true,
      location: true,
    },
  },
  creator: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  aiConfig: {
    select: {
      id: true,
      jobId: true,
      enableRanking: true,
      enableAutoShortlisting: true,
      shortlistLimit: true,
      minimumMatchScore: true,
      enableAiInterview: true,
      interviewLimit: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  jobSkills: {
    select: {
      jobId: true,
      skillId: true,
      importance: true,
      weight: true,
      skill: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
    },
  },
} satisfies Prisma.JobSelect;

export const jobListSelect = {
  id: true,
  title: true,
  applicationDeadline: true,
  status: true,
  totalOpenings: true,
  _count: {
    select: {
      applications: true,
    },
  },
} satisfies Prisma.JobSelect;

export const publicCompanySelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  banner: true,
  industry: true,
  size: true,
  type: true,
  website: true,
  location: true,
  description: true,
} satisfies Prisma.CompanySelect;

export const publicJobSelect = {
  id: true,
  title: true,
  slug: true,
  department: true,
  description: true,
  jobType: true,
  experienceLevel: true,
  educationLevel: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  location: true,
  workModel: true,
  applicationDeadline: true,
  totalOpenings: true,
  company: {
    select: publicCompanySelect,
  },
  jobSkills: {
    select: {
      importance: true,
      weight: true,
      skill: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
    },
  },
} satisfies Prisma.JobSelect;
