import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma, PrismaClient } from '@prisma/client';
import { publicJobSelect, jobSelect, jobListSelect } from './jobs.select';
import { DatabaseService } from '../../database/database.service';
import {
  PublicJobsQueryDto,
  PublicJobSortBy,
} from '../public/dto/public-jobs-query.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsQueryDto, JobSortBy } from './dto/find-jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobDeadlineProcessor } from '../processing/processors/job-deadline.processor';

@Injectable()
export class JobsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobDeadlineProcessor: JobDeadlineProcessor,
  ) {}

  private async resolveCompanyId(
    userId: string,
    companyId: string | null | undefined,
  ): Promise<string> {
    if (companyId) {
      return companyId;
    }

    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      throw new BadRequestException(
        'Recruiter must have a company before performing this action',
      );
    }

    return user.companyId;
  }

  private slugifySegment(value: string): string {
    const normalized = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized.length > 0 ? normalized : 'item';
  }

  private buildJobSlugBase(title: string, companyName: string): string {
    const titleSlug = this.slugifySegment(title);
    const companySlug = this.slugifySegment(companyName);
    return `${titleSlug}-at-${companySlug}`;
  }

  private async generateUniqueJobSlug(
    client: Prisma.TransactionClient | PrismaClient,
    title: string,
    companyName: string,
    excludeJobId?: string,
  ): Promise<string> {
    const maxLength = 350;
    const baseSlug = this.buildJobSlugBase(title, companyName).slice(
      0,
      maxLength,
    );

    // Fast path: try the clean base slug first
    const existing = await client.job.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    });

    if (!existing || existing.id === excludeJobId) {
      return baseSlug;
    }

    // Collision – try numbered variants
    for (let counter = 2; counter <= 1000; counter++) {
      const suffix = `-${counter}`;
      const slug = `${baseSlug.slice(0, maxLength - suffix.length)}${suffix}`;

      const conflict = await client.job.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!conflict || conflict.id === excludeJobId) {
        return slug;
      }
    }

    // Absolute last resort – still unique and within length limit
    const fallback = `${baseSlug.slice(0, maxLength - 14)}-${Date.now()}`;
    return fallback;
  }

  private async ensureSkillsExist(skillIds: string[]): Promise<void> {
    if (skillIds.length === 0) return;

    const uniqueSkillIds = [...new Set(skillIds)];

    // Single round-trip count is enough when we only care about existence
    const count = await this.db.skill.count({
      where: { id: { in: uniqueSkillIds } },
    });

    if (count === uniqueSkillIds.length) return;

    // Only fetch the missing ones when we actually need the detailed error
    const existing = await this.db.skill.findMany({
      where: { id: { in: uniqueSkillIds } },
      select: { id: true },
    });

    const existingSet = new Set(existing.map((s) => s.id));
    const missing = uniqueSkillIds.filter((id) => !existingSet.has(id));

    throw new BadRequestException(`Unknown skill ids: ${missing.join(', ')}`);
  }

  private validateSalaryRange(salaryMin: number, salaryMax: number) {
    if (salaryMin > salaryMax) {
      throw new BadRequestException('salaryMin must be less than salaryMax');
    }
  }

  private mergeAiConfig(
    current: {
      enableRanking: boolean;
      enableAutoShortlisting: boolean;
      shortlistLimit: number | null;
      minimumMatchScore: number | null;
      enableAiInterview: boolean;
      interviewLimit: number | null;
    } | null,
    patch: UpdateJobDto['aiConfig'],
  ) {
    if (!patch) {
      return null;
    }

    const merged = {
      enableRanking: patch.enableRanking ?? current?.enableRanking,
      enableAutoShortlisting:
        patch.enableAutoShortlisting ?? current?.enableAutoShortlisting,
      shortlistLimit: patch.shortlistLimit ?? current?.shortlistLimit,
      minimumMatchScore: patch.minimumMatchScore ?? current?.minimumMatchScore,
      enableAiInterview: patch.enableAiInterview ?? current?.enableAiInterview,
      interviewLimit: patch.interviewLimit ?? current?.interviewLimit,
    };

    const missingFields = Object.entries(merged)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing aiConfig fields: ${missingFields.join(', ')}`,
      );
    }

    return merged as {
      enableRanking: boolean;
      enableAutoShortlisting: boolean;
      shortlistLimit: number;
      minimumMatchScore: number;
      enableAiInterview: boolean;
      interviewLimit: number;
    };
  }

  private validateSlug(value: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value.trim())) {
      throw new BadRequestException('Invalid job slug');
    }
  }

  private normalizeSearchTerms(value?: string) {
    return value
      ? value
          .split(',')
          .map((term) => term.trim())
          .filter(Boolean)
      : [];
  }

  private buildPublicJobWhere(
    query: PublicJobsQueryDto,
    overrides: Prisma.JobWhereInput = {},
  ): Prisma.JobWhereInput {
    const skills = this.normalizeSearchTerms(query.skills);
    const now = new Date();

    return {
      ...overrides,
      status: JobStatus.OPEN,
      applicationDeadline: {
        gte: now,
      },
      ...(query.location
        ? { location: { contains: query.location, mode: 'insensitive' } }
        : {}),
      ...(query.employmentType ? { jobType: query.employmentType } : {}),
      ...(query.experienceLevel
        ? { experienceLevel: query.experienceLevel }
        : {}),
      ...(query.company
        ? {
            OR: [
              {
                company: {
                  name: { contains: query.company, mode: 'insensitive' },
                },
              },
              {
                company: {
                  slug: { contains: query.company, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
              {
                company: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                jobSkills: {
                  some: {
                    skill: {
                      name: { contains: query.search, mode: 'insensitive' },
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(skills.length > 0
        ? {
            jobSkills: {
              some: {
                skill: {
                  name: { in: skills },
                },
              },
            },
          }
        : {}),
    };
  }

  private buildPublicOrderBy(
    sort?: PublicJobSortBy,
  ): Prisma.JobOrderByWithRelationInput[] {
    switch (sort) {
      case PublicJobSortBy.DEADLINE:
        return [{ applicationDeadline: 'asc' }, { createdAt: 'desc' }];
      case PublicJobSortBy.SALARY_HIGH:
        return [{ salaryMax: 'desc' }, { createdAt: 'desc' }];
      case PublicJobSortBy.SALARY_LOW:
        return [{ salaryMin: 'asc' }, { createdAt: 'desc' }];
      case PublicJobSortBy.OLDEST:
        return [{ createdAt: 'asc' }];
      case PublicJobSortBy.NEWEST:
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private buildPagination(page: number, limit: number, totalItems: number) {
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    return {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  private async findPublicJobsBase(
    query: PublicJobsQueryDto,
    overrides: Prisma.JobWhereInput = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = this.buildPublicJobWhere(query, overrides);
    const orderBy = this.buildPublicOrderBy(query.sort);

    const [totalItems, items] = await Promise.all([
      this.db.job.count({ where }),
      this.db.job.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: publicJobSelect,
      }),
    ]);

    return {
      items,
      pagination: this.buildPagination(page, limit, totalItems),
    };
  }

  private async resolvePublicJobBySlug(jobSlug: string) {
    this.validateSlug(jobSlug);

    const job = await this.db.job.findFirst({
      where: {
        slug: jobSlug,
        status: JobStatus.OPEN,
        applicationDeadline: { gte: new Date() },
      },
      select: publicJobSelect,
    });

    if (!job) {
      throw new NotFoundException(`Job with slug ${jobSlug} not found`);
    }

    return job;
  }

  async findPublicJobs(query: PublicJobsQueryDto) {
    return this.findPublicJobsBase(query);
  }

  async findPublicJobsByCompanyId(
    companyId: string,
    query: PublicJobsQueryDto,
  ) {
    return this.findPublicJobsBase(query, { companyId });
  }

  async findPublicJobBySlug(jobSlug: string) {
    return this.resolvePublicJobBySlug(jobSlug);
  }

  async findFeaturedPublicJobs(limit = 6) {
    return this.db.job.findMany({
      where: {
        status: JobStatus.OPEN,
        applicationDeadline: {
          gte: new Date(),
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 20),
      select: publicJobSelect,
    });
  }

  async findSimilarPublicJobs(jobSlug: string) {
    const baseJob = await this.resolvePublicJobBySlug(jobSlug);
    const baseSkillIds = new Set(
      baseJob.jobSkills.map((skill) => skill.skill.id),
    );

    const candidates = await this.db.job.findMany({
      where: {
        id: { not: baseJob.id },
        status: JobStatus.OPEN,
        applicationDeadline: { gte: new Date() },
        OR: [
          { jobType: baseJob.jobType },
          { experienceLevel: baseJob.experienceLevel },
          { workModel: baseJob.workModel },
          {
            jobSkills: {
              some: {
                skillId: { in: [...baseSkillIds] },
              },
            },
          },
        ],
      },
      take: 25,
      orderBy: [{ createdAt: 'desc' }],
      select: publicJobSelect,
    });

    const rankedJobs = candidates
      .map((job) => {
        const sharedSkillCount = job.jobSkills.filter((skill) =>
          baseSkillIds.has(skill.skill.id),
        ).length;

        const score =
          (job.jobType === baseJob.jobType ? 3 : 0) +
          (job.experienceLevel === baseJob.experienceLevel ? 2 : 0) +
          (job.workModel === baseJob.workModel ? 1 : 0) +
          sharedSkillCount * 4;

        return { job, score };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map(({ job }) => job);

    return rankedJobs;
  }

  async create(
    userId: string,
    companyId: string | null | undefined,
    dto: CreateJobDto,
  ) {
    // 1. Validate salary early (no DB)
    if (dto.salary?.min != null && dto.salary?.max != null) {
      this.validateSalaryRange(dto.salary.min, dto.salary.max);
    }

    // 2. Resolve ownership + company outside the transaction
    const ownedCompanyId = await this.resolveCompanyId(userId, companyId);

    const company = await this.db.company.findUnique({
      where: { id: ownedCompanyId },
      select: { name: true },
    });

    if (!company) {
      throw new NotFoundException(
        `Company with id ${ownedCompanyId} not found`,
      );
    }

    // 3. Ensure skills exist
    const skillIds = dto.skills.map((s) => s.skillId);
    await this.ensureSkillsExist(skillIds);

    // 4. Generate slug outside the transaction when possible.
    const slug = await this.generateUniqueJobSlug(
      this.db,
      dto.title,
      company.name,
    );

    // 5. Short transaction
    return this.db.$transaction(
      async (tx) => {
        return tx.job.create({
          data: {
            companyId: ownedCompanyId,
            createdBy: userId,
            title: dto.title,
            slug,
            department: dto.department,
            description: dto.description,
            jobType: dto.jobType,
            experienceLevel: dto.experienceLevel,
            educationLevel: dto.educationLevel,
            salaryMin: dto.salary?.min,
            salaryMax: dto.salary?.max,
            salaryCurrency: dto.salary?.currency,
            salaryPeriod: dto.salary?.period,
            location: dto.location,
            workModel: dto.workModel,
            status: dto.status ?? JobStatus.DRAFT,
            applicationDeadline: dto.applicationDeadline,
            totalOpenings: dto.totalOpenings ?? 1,
            aiConfig: {
              create: {
                enableRanking: dto.aiConfig?.enableRanking ?? true,
                enableAutoShortlisting:
                  dto.aiConfig?.enableAutoShortlisting ?? true,
                shortlistLimit: dto.aiConfig?.shortlistLimit ?? null,
                minimumMatchScore: dto.aiConfig?.minimumMatchScore ?? null,
                enableAiInterview: dto.aiConfig?.enableAiInterview ?? false,
                interviewLimit: dto.aiConfig?.interviewLimit ?? null,
              },
            },
            jobSkills: {
              create: dto.skills.map((skill) => ({
                skillId: skill.skillId,
                importance: skill.importance,
                weight: skill.weight,
              })),
            },
          },
          select: jobSelect,
        });
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }

  async findAll(
    userId: string,
    companyId: string | null | undefined,
    query: FindJobsQueryDto,
  ) {
    const ownedCompanyId = await this.resolveCompanyId(userId, companyId);

    const where: Prisma.JobWhereInput = {
      companyId: ownedCompanyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.jobType ? { jobType: query.jobType } : {}),
      ...(query.workModel ? { workModel: query.workModel } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.JobOrderByWithRelationInput[] =
      query.sortBy === JobSortBy.DEADLINE
        ? [{ applicationDeadline: 'asc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];

    const jobs = await this.db.job.findMany({
      where,
      orderBy,
      select: jobListSelect,
    });

    return jobs.map(({ _count, ...job }) => ({
      ...job,
      applications: _count.applications,
    }));
  }

  async findTitles(userId: string, companyId: string | null | undefined) {
    const ownedCompanyId = await this.resolveCompanyId(userId, companyId);

    return this.db.job.findMany({
      where: { companyId: ownedCompanyId, status: JobStatus.OPEN },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
      },
    });
  }

  async findOne(
    userId: string,
    companyId: string | null | undefined,
    id: string,
  ) {
    const ownedCompanyId = await this.resolveCompanyId(userId, companyId);

    const job = await this.db.job.findFirst({
      where: {
        id,
        companyId: ownedCompanyId,
      },
      select: jobSelect,
    });

    if (!job) {
      throw new NotFoundException(`Job with id ${id} not found`);
    }

    return job;
  }

  async getSummary(
    userId: string,
    companyId: string | null | undefined,
    id: string,
  ) {
    const ownedCompanyId = await this.resolveCompanyId(userId, companyId);

    const job = await this.db.job.findFirst({
      where: {
        id,
        companyId: ownedCompanyId,
      },
      select: {
        id: true,
        title: true,
        totalOpenings: true,
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with id ${id} not found`);
    }

    return {
      id: job.id,
      title: job.title,
      openings: job.totalOpenings,
      applications: job._count.applications,
    };
  }

  async update(
    userId: string,
    companyId: string | null | undefined,
    id: string,
    dto: UpdateJobDto,
  ) {
    const ownedCompanyId = await this.resolveCompanyId(userId, companyId);

    const currentJob = await this.db.job.findFirst({
      where: {
        id,
        companyId: ownedCompanyId,
      },
      select: {
        id: true,
        title: true,
        salaryMin: true,
        salaryMax: true,
        company: {
          select: {
            name: true,
          },
        },
        aiConfig: {
          select: {
            enableRanking: true,
            enableAutoShortlisting: true,
            shortlistLimit: true,
            minimumMatchScore: true,
            enableAiInterview: true,
            interviewLimit: true,
          },
        },
      },
    });

    if (!currentJob) {
      throw new NotFoundException(`Job with id ${id} not found`);
    }

    const nextSalaryMin = dto.salary?.min ?? currentJob.salaryMin;
    const nextSalaryMax = dto.salary?.max ?? currentJob.salaryMax;
    this.validateSalaryRange(Number(nextSalaryMin), Number(nextSalaryMax));

    const aiConfig = this.mergeAiConfig(currentJob.aiConfig, dto.aiConfig);

    return this.db.$transaction(async (transaction) => {
      const slug = dto.title
        ? await this.generateUniqueJobSlug(
            transaction,
            dto.title,
            currentJob.company.name,
            id,
          )
        : undefined;

      await transaction.job.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(slug ? { slug } : {}),
          ...(dto.department ? { department: dto.department } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.jobType ? { jobType: dto.jobType } : {}),
          ...(dto.experienceLevel
            ? { experienceLevel: dto.experienceLevel }
            : {}),
          ...(dto.educationLevel ? { educationLevel: dto.educationLevel } : {}),
          ...(dto.salary?.min !== undefined
            ? { salaryMin: dto.salary.min }
            : {}),
          ...(dto.salary?.max !== undefined
            ? { salaryMax: dto.salary.max }
            : {}),
          ...(dto.salary?.currency
            ? { salaryCurrency: dto.salary.currency }
            : {}),
          ...(dto.salary?.period ? { salaryPeriod: dto.salary.period } : {}),
          ...(dto.location ? { location: dto.location } : {}),
          ...(dto.workModel ? { workModel: dto.workModel } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.applicationDeadline
            ? { applicationDeadline: dto.applicationDeadline }
            : {}),
          ...(dto.totalOpenings !== undefined
            ? { totalOpenings: dto.totalOpenings }
            : {}),
        },
      });

      if (aiConfig) {
        await transaction.jobAiConfig.upsert({
          where: { jobId: id },
          create: {
            jobId: id,
            ...aiConfig,
          },
          update: aiConfig,
        });
      }

      if (dto.skills) {
        await this.ensureSkillsExist(dto.skills.map((s) => s.skillId));

        await transaction.jobSkill.deleteMany({ where: { jobId: id } });

        if (dto.skills.length > 0) {
          await transaction.jobSkill.createMany({
            data: dto.skills.map((skill) => ({
              jobId: id,
              skillId: skill.skillId,
              importance: skill.importance,
              weight: skill.weight,
            })),
          });
        }
      }

      const updatedJob = await transaction.job.findFirst({
        where: {
          id,
          companyId: ownedCompanyId,
        },
        select: jobSelect,
      });

      if (!updatedJob) {
        throw new NotFoundException(`Job with id ${id} not found`);
      }

      return updatedJob;
    });
  }
}
