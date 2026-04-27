import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma, SkillImportance } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsQueryDto, JobSortBy } from './dto/find-jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';

const jobSelect = {
  id: true,
  companyId: true,
  createdBy: true,
  title: true,
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

@Injectable()
export class JobsService {
  constructor(private readonly db: DatabaseService) {}

  private requireCompanyId(companyId: number | null | undefined): number {
    if (!companyId) {
      throw new BadRequestException(
        'Recruiter must have a company before posting jobs',
      );
    }

    return companyId;
  }

  private async ensureSkillsExist(skillIds: number[]) {
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
      skillId: number;
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

  async create(
    userId: number,
    companyId: number | null | undefined,
    dto: CreateJobDto,
  ) {
    this.validateSalaryRange(dto.salaryMin, dto.salaryMax);

    const ownedCompanyId = this.requireCompanyId(companyId);

    return this.db.$transaction(async (transaction) => {
      const skills = await this.upsertSkills(transaction, dto.skills);

      return transaction.job.create({
        data: {
          companyId: ownedCompanyId,
          createdBy: userId,
          title: dto.title,
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

  async findAll(companyId: number | null | undefined, query: FindJobsQueryDto) {
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

  async findOne(companyId: number | null | undefined, id: number) {
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
    userId: number,
    companyId: number | null | undefined,
    id: number,
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
        salaryMin: true,
        salaryMax: true,
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

      await transaction.job.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
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
