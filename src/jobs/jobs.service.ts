import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma, SkillImportance } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  PublicJobsQueryDto,
  PublicJobSortBy,
} from '../public/dto/public-jobs-query.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsQueryDto, JobSortBy } from './dto/find-jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';

const jobSelect = {
  id: true,
  companyId: true,
  createdBy: true,
  title: true,
  slug: true,
  description: true,
  jobType: true,
  experienceLevel: true,
  salaryMin: true,
  salaryMax: true,
  location: true,
  workModel: true,
  status: true,
  applicationDeadline: true,
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
      minMatchScore: true,
      autoShortlistThreshold: true,
      enableAutoShortlist: true,
      enableAiInterview: true,
      aiInterviewThreshold: true,
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

const publicCompanySelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  industry: true,
  companySize: true,
  website: true,
  location: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

const publicJobSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  jobType: true,
  experienceLevel: true,
  salaryMin: true,
  salaryMax: true,
  location: true,
  workModel: true,
  status: true,
  applicationDeadline: true,
  createdAt: true,
  updatedAt: true,
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

@Injectable()
export class JobsService {
  constructor(private readonly db: DatabaseService) {}

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
    transaction: Prisma.TransactionClient,
    title: string,
    companyName: string,
    excludeJobId?: string,
  ): Promise<string> {
    const maxLength = 350;
    const baseSlug = this.buildJobSlugBase(title, companyName).slice(
      0,
      maxLength,
    );

    let counter = 0;
    while (counter < 1000) {
      const suffix = counter === 0 ? '' : `-${String(counter + 1)}`;
      const slug = `${baseSlug.slice(0, maxLength - suffix.length)}${suffix}`;

      const existing = await transaction.job.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing || existing.id === excludeJobId) {
        return slug;
      }

      counter += 1;
    }

    throw new ConflictException('Could not generate a unique job slug');
  }

  private requireCompanyId(companyId: string | null | undefined): string {
    if (!companyId) {
      throw new BadRequestException(
        'Recruiter must have a company before posting jobs',
      );
    }

    return companyId;
  }

  private async ensureSkillsExist(skillIds: string[]) {
    const uniqueSkillIds = [...new Set(skillIds)];
    const existingSkills = await this.db.skill.findMany({
      where: { id: { in: uniqueSkillIds } },
      select: { id: true },
    });

    const existingSkillIds = new Set(existingSkills.map((skill) => skill.id));
    const missingSkillIds = uniqueSkillIds.filter(
      (skillId) => !existingSkillIds.has(skillId),
    );

    if (missingSkillIds.length > 0) {
      throw new BadRequestException(
        `Unknown skill ids: ${missingSkillIds.join(', ')}`,
      );
    }
  }

  private normalizeSkillName(name: string): string {
    return name.trim();
  }

  private normalizeSkillCategory(category: string): string {
    return category.trim();
  }

  private async upsertSkills(
    transaction: Prisma.TransactionClient,
    skills: Array<{
      name: string;
      category: string;
      importance: SkillImportance;
      weight: number;
    }>,
  ): Promise<
    Array<{
      skillId: string;
      importance: SkillImportance;
      weight: number;
    }>
  > {
    const uniqueSkills = new Map<
      string,
      {
        name: string;
        category: string;
        importance: SkillImportance;
        weight: number;
      }
    >();

    for (const skill of skills) {
      const name = this.normalizeSkillName(skill.name);
      const category = this.normalizeSkillCategory(skill.category);
      const key = name.toLowerCase();

      if (uniqueSkills.has(key)) {
        continue;
      }

      uniqueSkills.set(key, {
        name,
        category,
        importance: skill.importance,
        weight: skill.weight,
      });
    }

    const skillRecords = await Promise.all(
      [...uniqueSkills.values()].map(async (skill) => {
        const existingSkill = await transaction.skill.findUnique({
          where: { name: skill.name },
          select: { id: true, category: true },
        });

        if (existingSkill) {
          if (existingSkill.category !== skill.category) {
            throw new BadRequestException(
              `Skill "${skill.name}" already exists with category "${existingSkill.category}"`,
            );
          }

          return {
            id: existingSkill.id,
            name: skill.name,
            category: existingSkill.category,
          };
        }

        return transaction.skill.create({
          data: {
            name: skill.name,
            category: skill.category,
          },
          select: {
            id: true,
            name: true,
            category: true,
          },
        });
      }),
    );

    const skillIdByName = new Map(
      skillRecords.map((skill) => [skill.name.toLowerCase(), skill.id]),
    );

    return [...uniqueSkills.values()].map((skill) => {
      const skillId = skillIdByName.get(skill.name.toLowerCase());

      if (!skillId) {
        throw new BadRequestException(
          `Unable to resolve skill id for "${skill.name}"`,
        );
      }

      return {
        skillId,
        importance: skill.importance,
        weight: skill.weight,
      };
    });
  }

  private validateSalaryRange(salaryMin: number, salaryMax: number) {
    if (salaryMin > salaryMax) {
      throw new BadRequestException('salaryMin must be less than salaryMax');
    }
  }

  private mergeAiConfig(
    current: {
      minMatchScore: number;
      autoShortlistThreshold: number;
      enableAutoShortlist: boolean;
      enableAiInterview: boolean;
      aiInterviewThreshold: number;
    } | null,
    patch: UpdateJobDto['aiConfig'],
  ) {
    if (!patch) {
      return null;
    }

    const merged = {
      minMatchScore: patch.minMatchScore ?? current?.minMatchScore,
      autoShortlistThreshold:
        patch.autoShortlistThreshold ?? current?.autoShortlistThreshold,
      enableAutoShortlist:
        patch.enableAutoShortlist ?? current?.enableAutoShortlist,
      enableAiInterview: patch.enableAiInterview ?? current?.enableAiInterview,
      aiInterviewThreshold:
        patch.aiInterviewThreshold ?? current?.aiInterviewThreshold,
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
      minMatchScore: number;
      autoShortlistThreshold: number;
      enableAutoShortlist: boolean;
      enableAiInterview: boolean;
      aiInterviewThreshold: number;
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

    // Use Promise.all for parallel reads instead of transaction
    // (pgbouncer doesn't support complex transactions)
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
      },
      select: publicJobSelect,
    });

    if (!job) {
      throw new NotFoundException(`Job with slug ${jobSlug} not found`);
    }

    if (job.status !== JobStatus.OPEN || job.applicationDeadline < new Date()) {
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
    this.validateSalaryRange(dto.salaryMin, dto.salaryMax);

    const ownedCompanyId = this.requireCompanyId(companyId);

    return this.db.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({
        where: { id: ownedCompanyId },
        select: { name: true },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with id ${ownedCompanyId} not found`,
        );
      }

      const slug = await this.generateUniqueJobSlug(
        transaction,
        dto.title,
        company.name,
      );

      const skills = await this.upsertSkills(transaction, dto.skills);

      return transaction.job.create({
        data: {
          companyId: ownedCompanyId,
          createdBy: userId,
          title: dto.title,
          slug,
          description: dto.description,
          jobType: dto.jobType,
          experienceLevel: dto.experienceLevel,
          salaryMin: dto.salaryMin,
          salaryMax: dto.salaryMax,
          location: dto.location,
          workModel: dto.workModel,
          status: dto.status ?? JobStatus.DRAFT,
          applicationDeadline: dto.applicationDeadline,
          aiConfig: {
            create: dto.aiConfig,
          },
          jobSkills: {
            create: skills.map((skill) => ({
              skillId: skill.skillId,
              importance: skill.importance,
              weight: skill.weight,
            })),
          },
        },
        select: jobSelect,
      });
    });
  }

  async findAll(companyId: string | null | undefined, query: FindJobsQueryDto) {
    const ownedCompanyId = this.requireCompanyId(companyId);

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

    return this.db.job.findMany({
      where,
      orderBy,
      select: jobSelect,
    });
  }

  async findOne(companyId: string | null | undefined, id: string) {
    const ownedCompanyId = this.requireCompanyId(companyId);

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

  async update(
    userId: string,
    companyId: string | null | undefined,
    id: string,
    dto: UpdateJobDto,
  ) {
    const ownedCompanyId = this.requireCompanyId(companyId);

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
            minMatchScore: true,
            autoShortlistThreshold: true,
            enableAutoShortlist: true,
            enableAiInterview: true,
            aiInterviewThreshold: true,
          },
        },
      },
    });

    if (!currentJob) {
      throw new NotFoundException(`Job with id ${id} not found`);
    }

    const nextSalaryMin = dto.salaryMin ?? currentJob.salaryMin;
    const nextSalaryMax = dto.salaryMax ?? currentJob.salaryMax;
    this.validateSalaryRange(nextSalaryMin, nextSalaryMax);

    const aiConfig = this.mergeAiConfig(currentJob.aiConfig, dto.aiConfig);

    return this.db.$transaction(async (transaction) => {
      const skills = dto.skills
        ? await this.upsertSkills(transaction, dto.skills)
        : null;

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
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.jobType ? { jobType: dto.jobType } : {}),
          ...(dto.experienceLevel
            ? { experienceLevel: dto.experienceLevel }
            : {}),
          ...(dto.salaryMin !== undefined ? { salaryMin: dto.salaryMin } : {}),
          ...(dto.salaryMax !== undefined ? { salaryMax: dto.salaryMax } : {}),
          ...(dto.location ? { location: dto.location } : {}),
          ...(dto.workModel ? { workModel: dto.workModel } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.applicationDeadline
            ? { applicationDeadline: dto.applicationDeadline }
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
        await transaction.jobSkill.deleteMany({
          where: { jobId: id },
        });

        if (skills && skills.length > 0) {
          await transaction.jobSkill.createMany({
            data: skills.map((skill) => ({
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
