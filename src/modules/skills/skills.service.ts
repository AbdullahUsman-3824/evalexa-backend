import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { FindSkillsDto } from './dto/find-skills.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

const skillSelect = {
  id: true,
  name: true,
  category: true,
};

const normalize = (str: string) => str.trim().toLowerCase();

@Injectable()
export class SkillsService {
  constructor(private db: DatabaseService) {}

  async create(createSkillDto: CreateSkillDto) {
    try {
      return await this.db.skill.create({
        data: {
          name: normalize(createSkillDto.name),
          category: normalize(createSkillDto.category),
        },
        select: skillSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Skill with name "${normalize(createSkillDto.name)}" already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(query: FindSkillsDto) {
    const where: Prisma.SkillWhereInput = {};

    if (query.category) {
      where.category = {
        contains: query.category,
        mode: 'insensitive',
      };
    }

    if (query.search) {
      where.name = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    return await this.db.skill.findMany({
      where,
      select: skillSelect,
      orderBy: { name: 'asc' },
    });
  }

  async findCategories() {
    const skills = await this.db.skill.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    return skills.map((s) => s.category);
  }

  async findOne(id: string) {
    const skill = await this.db.skill.findUnique({
      where: { id },
      select: skillSelect,
    });

    if (!skill) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }

    return skill;
  }

  async update(id: string, updateSkillDto: UpdateSkillDto) {
    try {
      return await this.db.skill.update({
        where: { id },
        data: {
          ...updateSkillDto,
          name: updateSkillDto.name
            ? normalize(updateSkillDto.name)
            : undefined,
          category: updateSkillDto.category
            ? normalize(updateSkillDto.category)
            : undefined,
        },
        select: skillSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Skill with id "${id}" not found`);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const skillName = updateSkillDto.name
          ? normalize(updateSkillDto.name)
          : 'unknown';
        throw new ConflictException(
          `Skill with name "${skillName}" already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.db.skill.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Skill with id "${id}" not found`);
      }
      throw error;
    }
  }
}
