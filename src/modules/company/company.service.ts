import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JobStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { SupabaseService } from '../../database/supabase.service';
import {
  PublicCompaniesQueryDto,
  PublicCompanySortBy,
} from '../public/dto/public-companies-query.dto';
import { UsersService } from '../users/users.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import type { Express } from 'express';

const companyOwnerSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  banner: true,
  industry: true,
  size: true,
  foundedYear: true,
  type: true,
  website: true,
  location: true,
  description: true,
  email: true,
  verificationDocuments: true,
  verificationStatus: true,
  subscriptionPlan: true,
  isActive: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

const publicCompanySelect = {
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
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

interface CompanyFiles {
  logo?: Express.Multer.File;
  banner?: Express.Multer.File;
  verificationDocuments?: Express.Multer.File[];
}

@Injectable()
export class CompanyService {
  private readonly BUCKETS = {
    logos: 'company-logos',
    banners: 'company-banners',
    verificationDocs: 'company-verification-docs', // private bucket
  } as const;

  constructor(
    private readonly db: DatabaseService,
    private readonly usersService: UsersService,
    private readonly supabase: SupabaseService,
  ) {}

  // ---------- slug helpers ----------

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

  // ---------- Supabase Storage helpers ----------

  private buildStoragePath(
    companyId: string,
    prefix: string,
    originalName: string,
  ): string {
    const dotIndex = originalName.lastIndexOf('.');
    const ext = dotIndex !== -1 ? originalName.slice(dotIndex + 1) : 'bin';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${companyId}/${prefix}-${timestamp}-${random}.${ext}`;
  }

  private async uploadPublicFile(
    bucket: string,
    path: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const { error } = await this.supabase
      .getClient()
      .storage.from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }

    const { data } = this.supabase
      .getClient()
      .storage.from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  private async uploadPrivateFile(
    bucket: string,
    path: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const { error } = await this.supabase
      .getClient()
      .storage.from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }

    // Private bucket: store the path, not a URL. Generate signed URLs on demand.
    return path;
  }

  private async deleteFile(bucket: string, path: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .storage.from(bucket)
      .remove([path]);
    if (error) {
      // Non-fatal: don't let a cleanup failure mask the original error or block the main flow
      console.error(
        `Failed to delete ${path} from ${bucket}: ${error.message}`,
      );
    }
  }

  private extractPathFromPublicUrl(bucket: string, url: string): string | null {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    return index === -1 ? null : url.slice(index + marker.length);
  }

  /**
   * Generates short-lived signed URLs for a company's verification documents.
   * Call this on demand (e.g. admin review screen) rather than storing signed URLs,
   * since they expire.
   */
  async getVerificationDocumentSignedUrls(
    userId: string,
    companyId: string,
    expiresInSeconds = 300,
  ): Promise<string[]> {
    const company = await this.db.company.findFirst({
      where: { id: companyId, createdBy: userId },
      select: { verificationDocuments: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (company.verificationDocuments.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .getClient()
      .storage.from(this.BUCKETS.verificationDocs)
      .createSignedUrls(company.verificationDocuments, expiresInSeconds);

    if (error) {
      throw new BadRequestException(
        `Failed to generate document URLs: ${error.message}`,
      );
    }

    const failed = data.filter((entry) => entry.error || !entry.signedUrl);
    if (failed.length > 0) {
      console.error(
        `Failed to sign ${failed.length} of ${data.length} verification documents for company ${companyId}`,
      );
    }

    return data
      .filter((entry): entry is typeof entry & { signedUrl: string } =>
        Boolean(entry.signedUrl),
      )
      .map((entry) => entry.signedUrl);
  }

  // ---------- public discovery ----------

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

    const [totalItems, companies] = await Promise.all([
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

  // ---------- owner-facing CRUD ----------

  async create(userId: string, dto: CreateCompanyDto, files?: CompanyFiles) {
    const recruiter = await this.usersService.findOne(userId);

    if (recruiter.companyId) {
      throw new ConflictException('Recruiter already has a company');
    }

    const companyId = randomUUID();
    const uploadedPaths: { bucket: string; path: string }[] = [];

    let logoUrl: string | undefined;
    let bannerUrl: string | undefined;
    const verificationDocumentPaths: string[] = [];

    try {
      if (files?.logo) {
        const path = this.buildStoragePath(
          companyId,
          'logo',
          files.logo.originalname,
        );
        logoUrl = await this.uploadPublicFile(
          this.BUCKETS.logos,
          path,
          files.logo,
        );
        uploadedPaths.push({ bucket: this.BUCKETS.logos, path });
      }

      if (files?.banner) {
        const path = this.buildStoragePath(
          companyId,
          'banner',
          files.banner.originalname,
        );
        bannerUrl = await this.uploadPublicFile(
          this.BUCKETS.banners,
          path,
          files.banner,
        );
        uploadedPaths.push({ bucket: this.BUCKETS.banners, path });
      }

      if (files?.verificationDocuments?.length) {
        for (const doc of files.verificationDocuments) {
          const path = this.buildStoragePath(
            companyId,
            'verification',
            doc.originalname,
          );
          await this.uploadPrivateFile(
            this.BUCKETS.verificationDocs,
            path,
            doc,
          );
          uploadedPaths.push({ bucket: this.BUCKETS.verificationDocs, path });
          verificationDocumentPaths.push(path);
        }
      }
    } catch (error) {
      await Promise.all(
        uploadedPaths.map(({ bucket, path }) => this.deleteFile(bucket, path)),
      );
      throw error;
    }

    try {
      return await this.db.$transaction(async (tx) => {
        const slug = await this.generateUniqueSlug(tx, dto.name);

        const company = await tx.company.create({
          data: {
            id: companyId,
            ...dto,
            slug,
            logo: logoUrl,
            banner: bannerUrl,
            verificationDocuments: verificationDocumentPaths,
            createdBy: userId,
          },
          select: companyOwnerSelect,
        });

        await tx.user.update({
          where: { id: userId },
          data: { companyId: company.id },
        });

        return company;
      });
    } catch (error) {
      // DB write failed after a successful upload — clean up orphaned files
      await Promise.all(
        uploadedPaths.map(({ bucket, path }) => this.deleteFile(bucket, path)),
      );
      throw error;
    }
  }

  async findAll(userId: string) {
    return this.db.company.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: 'desc' },
      select: companyOwnerSelect,
    });
  }

  async findOne(userId: string, id: string) {
    const company = await this.db.company.findFirst({
      where: {
        id,
        createdBy: userId,
      },
      select: companyOwnerSelect,
    });

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCompanyDto,
    files?: CompanyFiles,
  ) {
    const existing = await this.db.company.findFirst({
      where: { id, createdBy: userId },
    });

    if (!existing) {
      throw new NotFoundException('Company not found');
    }

    const uploadedPaths: { bucket: string; path: string }[] = [];
    const data: Prisma.CompanyUpdateManyMutationInput = { ...dto };

    try {
      if (files?.logo) {
        const path = this.buildStoragePath(id, 'logo', files.logo.originalname);
        data.logo = await this.uploadPublicFile(
          this.BUCKETS.logos,
          path,
          files.logo,
        );
        uploadedPaths.push({ bucket: this.BUCKETS.logos, path });
      }

      if (files?.banner) {
        const path = this.buildStoragePath(
          id,
          'banner',
          files.banner.originalname,
        );
        data.banner = await this.uploadPublicFile(
          this.BUCKETS.banners,
          path,
          files.banner,
        );
        uploadedPaths.push({ bucket: this.BUCKETS.banners, path });
      }

      if (files?.verificationDocuments?.length) {
        const newPaths: string[] = [];
        for (const doc of files.verificationDocuments) {
          const path = this.buildStoragePath(
            id,
            'verification',
            doc.originalname,
          );
          await this.uploadPrivateFile(
            this.BUCKETS.verificationDocs,
            path,
            doc,
          );
          uploadedPaths.push({ bucket: this.BUCKETS.verificationDocs, path });
          newPaths.push(path);
        }
        // Append to existing docs rather than replacing — recruiters submit more over time
        data.verificationDocuments = [
          ...existing.verificationDocuments,
          ...newPaths,
        ];
      }
    } catch (error) {
      await Promise.all(
        uploadedPaths.map(({ bucket, path }) => this.deleteFile(bucket, path)),
      );
      throw error;
    }

    try {
      const updateResult = await this.db.$transaction(async (tx) => {
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
    } catch (error) {
      await Promise.all(
        uploadedPaths.map(({ bucket, path }) => this.deleteFile(bucket, path)),
      );
      throw error;
    }

    // DB update succeeded — now safe to delete the old logo/banner files it replaced
    if (files?.logo && existing.logo) {
      const oldPath = this.extractPathFromPublicUrl(
        this.BUCKETS.logos,
        existing.logo,
      );
      if (oldPath) await this.deleteFile(this.BUCKETS.logos, oldPath);
    }
    if (files?.banner && existing.banner) {
      const oldPath = this.extractPathFromPublicUrl(
        this.BUCKETS.banners,
        existing.banner,
      );
      if (oldPath) await this.deleteFile(this.BUCKETS.banners, oldPath);
    }

    const company = await this.db.company.findFirst({
      where: {
        id,
        createdBy: userId,
      },
      select: companyOwnerSelect,
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async remove(userId: string, id: string) {
    const company = await this.db.$transaction(async (tx) => {
      const existing = await tx.company.findFirst({
        where: {
          id,
          createdBy: userId,
        },
        select: companyOwnerSelect,
      });

      if (!existing) {
        throw new NotFoundException('Company not found');
      }

      await tx.user.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });

      await tx.company.delete({
        where: { id },
      });

      return existing;
    });

    const filesToDelete: { bucket: string; path: string }[] = [];

    if (company.logo) {
      const path = this.extractPathFromPublicUrl(
        this.BUCKETS.logos,
        company.logo,
      );
      if (path) filesToDelete.push({ bucket: this.BUCKETS.logos, path });
    }
    if (company.banner) {
      const path = this.extractPathFromPublicUrl(
        this.BUCKETS.banners,
        company.banner,
      );
      if (path) filesToDelete.push({ bucket: this.BUCKETS.banners, path });
    }
    for (const docPath of company.verificationDocuments) {
      filesToDelete.push({
        bucket: this.BUCKETS.verificationDocs,
        path: docPath,
      });
    }

    await Promise.all(
      filesToDelete.map(({ bucket, path }) => this.deleteFile(bucket, path)),
    );

    return company;
  }

  // ---------- stats ----------

  async getCompanyStats(userId: string, companyId: string) {
    // Reuse your existing ownership check pattern
    const company = await this.db.company.findFirst({
      where: { id: companyId, createdBy: userId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // ---- REAL data: derived from the Job table ----
    const [activeJobs, totalJobsPosted] = await Promise.all([
      this.db.job.count({
        where: {
          companyId,
          status: JobStatus.OPEN,
          applicationDeadline: { gte: new Date() },
        },
      }),
      this.db.job.count({
        where: { companyId },
      }),
    ]);

    // ---- DUMMY data: hardcoded until Application/Interview/Hire models exist ----
    // Swap these out once you have the relevant tables to query from.
    const dummyStats = {
      totalApplicants: 4258,
      totalShortlisted: 486,
      totalInterviews: 221,
      totalHires: 137,
      avgResponseTimeHours: 14,
      avgTimeToHireDays: 8.4,
      candidateRating: 4.7,
    };

    return {
      activeJobs,
      totalJobsPosted,
      ...dummyStats,
    };
  }
}
