import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const companyPublicSelect = {
  id: true,
  name: true,
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

@Injectable()
export class CompanyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly usersService: UsersService,
  ) {}

  async create(userId: number, dto: CreateCompanyDto) {
    const recruiter = await this.usersService.findOne(userId);

    if (recruiter.companyId) {
      throw new ConflictException('Recruiter already has a company');
    }

    return this.db.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          ...dto,
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

  async findAll(userId: number) {
    return this.db.company.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: 'desc' },
      select: companyPublicSelect,
    });
  }

  async findOne(userId: number, id: number) {
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

  async update(userId: number, id: number, dto: UpdateCompanyDto) {
    const updateResult = await this.db.company.updateMany({
      where: {
        id,
        createdBy: userId,
      },
      data: dto,
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

  async remove(userId: number, id: number) {
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
