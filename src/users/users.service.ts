import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { Prisma } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DatabaseService } from '../database/database.service';

const userPublicSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  companyId: true,
  isVerified: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hasPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === code
    );
  }

  async findByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const email = this.normalizeEmail(createUserDto.email);
    const hashedPassword = await hash(createUserDto.password, 10);

    const existingUser = await this.db.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    try {
      return await this.db.user.create({
        data: {
          ...createUserDto,
          password: hashedPassword,
          role: createUserDto.role ?? 'recruiter',
          email,
          companyId: null,
        },
        select: userPublicSelect,
      });
    } catch (error: unknown) {
      if (this.hasPrismaErrorCode(error, 'P2002')) {
        throw new BadRequestException('Email is already registered');
      }
      throw error;
    }
  }

  findAll() {
    return this.db.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: userPublicSelect,
    });
  }

  async findOne(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: userPublicSelect,
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const normalizedEmail = updateUserDto.email
      ? this.normalizeEmail(updateUserDto.email)
      : undefined;

    if (normalizedEmail) {
      const existingUser = await this.db.user.findFirst({
        where: {
          email: normalizedEmail,
          id: { not: id },
        },
        select: { id: true },
      });

      if (existingUser) {
        throw new BadRequestException('Email is already registered');
      }
    }

    const hashedPassword = updateUserDto.password
      ? await hash(updateUserDto.password, 10)
      : undefined;

    try {
      return await this.db.user.update({
        where: { id },
        data: {
          ...updateUserDto,
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          ...(hashedPassword ? { password: hashedPassword } : {}),
        },
        select: userPublicSelect,
      });
    } catch (error: unknown) {
      if (this.hasPrismaErrorCode(error, 'P2002')) {
        throw new BadRequestException('Email is already registered');
      }
      if (this.hasPrismaErrorCode(error, 'P2025')) {
        throw new NotFoundException(`User with id ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    try {
      return await this.db.user.delete({
        where: { id },
        select: userPublicSelect,
      });
    } catch (error: unknown) {
      if (this.hasPrismaErrorCode(error, 'P2003')) {
        throw new ConflictException(
          'User cannot be deleted because it is referenced by other records',
        );
      }
      if (this.hasPrismaErrorCode(error, 'P2014')) {
        throw new ConflictException(
          'User cannot be deleted because it is referenced by other records',
        );
      }
      if (this.hasPrismaErrorCode(error, 'P2025')) {
        throw new NotFoundException(`User with id ${id} not found`);
      }
      throw error;
    }
  }
}
