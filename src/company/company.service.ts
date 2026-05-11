import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  PublicCompaniesQueryDto,
  PublicCompanySortBy,
} from '../public/dto/public-companies-query.dto';
import { UsersService } from '../users/users.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const companyPublicSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  industry: true,
  companySize: true,
  website: true,
  location: true,
  description: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

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

@Injectable()
export class CompanyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly usersService: UsersService,
  ) {}

  private toBaseSlug(name: string): string {
    const normalized = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized.length > 0 ? normalized : 'company';
  }

  private async generateUniqueSlug(
    tx: Prisma.TransactionClient,
    name: string,
    excludeCompanyId?: string,
  ): Promise<string> {
    const baseSlug = this.toBaseSlug(name).slice(0, 170);

    let counter = 0;
    while (counter < 1000) {
      const slug =
        counter === 0 ? baseSlug : `${baseSlug}-${String(counter + 1)}`;

      const existing = await tx.company.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing || existing.id === excludeCompanyId) {
        return slug;
      }

      counter += 1;
    }

    throw new ConflictException('Could not generate a unique company slug');
  }

  private validateSlug(value: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value.trim())) {
      throw new NotFoundException('Company not found');
    }
  }

  private buildPublicOrderBy(
    sort?: PublicCompanySortBy,
  ): Prisma.CompanyOrderByWithRelationInput[] {
    switch (sort) {
      case PublicCompanySortBy.NAME_ASC:
        return [{ name: 'asc' }];
      case PublicCompanySortBy.NAME_DESC:
        return [{ name: 'desc' }];
      case PublicCompanySortBy.JOBS_HIGH:
      case PublicCompanySortBy.JOBS_LOW:
      case PublicCompanySortBy.NEWEST:
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

  private async getOpenJobCounts(companyIds: string[]) {
    if (companyIds.length === 0) {
      return new Map<string, number>();
    }

    const openJobs = await this.db.job.groupBy({
      by: ['companyId'],
      where: {
        companyId: { in: companyIds },
        status: JobStatus.OPEN,
        applicationDeadline: {
          gte: new Date(),
        },
      },
      _count: {
        _all: true,
      },
    });

    return new Map(
      openJobs.map((entry) => [entry.companyId, entry._count._all]),
    );
  }

  async findPublicCompanies(query: PublicCompaniesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where: Prisma.CompanyWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.industry
        ? { industry: { contains: query.industry, mode: 'insensitive' } }
        : {}),
    };

    const orderBy = this.buildPublicOrderBy(query.sort);

    const [totalItems, companies] = await this.db.$transaction([
      this.db.company.count({ where }),
      this.db.company.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: publicCompanySelect,
      }),
    ]);

    const openJobCounts = await this.getOpenJobCounts(
      companies.map((company) => company.id),
    );

    return {
      items: companies.map((company) => ({
        ...company,
        openJobsCount: openJobCounts.get(company.id) ?? 0,
      })),
      pagination: this.buildPagination(page, limit, totalItems),
    };
  }

  async findPublicCompanyBySlug(companySlug: string) {
    this.validateSlug(companySlug);

    const company = await this.db.company.findFirst({
      where: {
        slug: companySlug,
      },
      select: publicCompanySelect,
    });

    if (!company) {
      throw new NotFoundException(`Company with slug ${companySlug} not found`);
    }

    const openJobsCount = await this.db.job.count({
      where: {
        companyId: company.id,
        status: JobStatus.OPEN,
        applicationDeadline: {
          gte: new Date(),
        },
      },
    });

    return {
      ...company,
      openJobsCount,
    };
  }

  async create(userId: string, dto: CreateCompanyDto) {
    const recruiter = await this.usersService.findOne(userId);

    if (recruiter.companyId) {
      throw new ConflictException('Recruiter already has a company');
    }

    return this.db.$transaction(async (tx) => {
      const slug = await this.generateUniqueSlug(tx, dto.name);

      const company = await tx.company.create({
        data: {
          ...dto,
          slug,
          createdBy: userId,
        },
        select: companyPublicSelect,
      });

      await tx.user.update({
        where: { id: userId },
        data: { companyId: company.id },
      });

      return company;
    });
  }

  async findAll(userId: string) {
    return this.db.company.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: 'desc' },
      select: companyPublicSelect,
    });
  }

  async findOne(userId: string, id: string) {
    const company = await this.db.company.findFirst({
      where: {
        id,
        createdBy: userId,
      },
      select: companyPublicSelect,
    });

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async update(userId: string, id: string, dto: UpdateCompanyDto) {
    const updateResult = await this.db.$transaction(async (tx) => {
      const data: Prisma.CompanyUpdateManyMutationInput = { ...dto };

      if (dto.name) {
        data.slug = await this.generateUniqueSlug(tx, dto.name, id);
      }

      return tx.company.updateMany({
        where: {
          id,
          createdBy: userId,
        },
        data,
      });
    });

    if (updateResult.count === 0) {
      throw new NotFoundException('Company not found');
    }

    const company = await this.db.company.findFirst({
      where: {
        id,
        createdBy: userId,
      },
      select: companyPublicSelect,
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async remove(userId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: {
          id,
          createdBy: userId,
        },
        select: companyPublicSelect,
      });

      if (!company) {
        throw new NotFoundException('Company not found');
      }

      await tx.user.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });

      await tx.company.delete({
        where: { id },
      });

      return company;
    });
  }
}
