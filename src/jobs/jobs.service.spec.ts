import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobStatus, SkillImportance } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let dbMock: {
    job: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    skill: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    jobAiConfig: {
      upsert: jest.Mock;
    };
    jobSkill: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    dbMock = {
      job: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      skill: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      jobAiConfig: {
        upsert: jest.fn(),
      },
      jobSkill: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    dbMock.$transaction.mockImplementation(
      async (
        callback: (tx: {
          job: typeof dbMock.job;
          skill: typeof dbMock.skill;
          jobAiConfig: typeof dbMock.jobAiConfig;
          jobSkill: typeof dbMock.jobSkill;
        }) => Promise<unknown>,
      ) =>
        callback({
          job: dbMock.job,
          skill: dbMock.skill,
          jobAiConfig: dbMock.jobAiConfig,
          jobSkill: dbMock.jobSkill,
        }),
    );

    const module = await import('@nestjs/testing').then(({ Test }) =>
      Test.createTestingModule({
        providers: [
          JobsService,
          {
            provide: DatabaseService,
            useValue: dbMock,
          },
        ],
      }).compile(),
    );

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create throws BadRequestException when salary range is invalid', async () => {
    await expect(
      service.create(7, 4, {
        title: 'Backend Engineer',
        description: 'Build APIs',
        jobType: 'full-time' as never,
        experienceLevel: 'senior' as never,
        salaryMin: 200,
        salaryMax: 100,
        location: 'Lahore',
        workModel: 'hybrid' as never,
        applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
        skills: [],
        aiConfig: {
          minMatchScore: 70,
          autoShortlistThreshold: 80,
          enableAutoShortlist: true,
          enableAiInterview: false,
          aiInterviewThreshold: 90,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create throws BadRequestException when recruiter has no company', async () => {
    await expect(
      service.create(7, null, {
        title: 'Backend Engineer',
        description: 'Build APIs',
        jobType: 'full-time' as never,
        experienceLevel: 'senior' as never,
        salaryMin: 100,
        salaryMax: 200,
        location: 'Lahore',
        workModel: 'hybrid' as never,
        applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
        skills: [],
        aiConfig: {
          minMatchScore: 70,
          autoShortlistThreshold: 80,
          enableAutoShortlist: true,
          enableAiInterview: false,
          aiInterviewThreshold: 90,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create reuses and creates skills in the same transaction', async () => {
    dbMock.skill.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    dbMock.skill.findUnique
      .mockResolvedValueOnce({ id: 1, category: 'Backend' })
      .mockResolvedValueOnce(null);
    dbMock.skill.create.mockResolvedValue({
      id: 2,
      name: 'GraphQL',
      category: 'Backend',
    });
    dbMock.job.create.mockResolvedValue({ id: 9, title: 'Backend Engineer' });

    const dto = {
      title: 'Backend Engineer',
      description: 'Build APIs',
      jobType: 'full-time' as never,
      experienceLevel: 'senior' as never,
      salaryMin: 100,
      salaryMax: 200,
      location: 'Lahore',
      workModel: 'hybrid' as never,
      status: JobStatus.DRAFT,
      applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
      skills: [
        {
          name: 'Node.js',
          category: 'Backend',
          importance: SkillImportance.REQUIRED,
          weight: 10,
        },
        {
          name: 'GraphQL',
          category: 'Backend',
          importance: SkillImportance.PREFERRED,
          weight: 5,
        },
      ],
      aiConfig: {
        minMatchScore: 70,
        autoShortlistThreshold: 80,
        enableAutoShortlist: true,
        enableAiInterview: false,
        aiInterviewThreshold: 90,
      },
    };

    const result = await service.create(7, 4, dto as never);

    expect(dbMock.$transaction).toHaveBeenCalled();
    expect(dbMock.skill.findUnique).toHaveBeenCalledWith({
      where: { name: 'Node.js' },
      select: { id: true, category: true },
    });
    expect(dbMock.skill.create).toHaveBeenCalledWith({
      data: { name: 'GraphQL', category: 'Backend' },
      select: { id: true, name: true, category: true },
    });
    expect(dbMock.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 4,
        createdBy: 7,
        status: JobStatus.DRAFT,
        jobSkills: {
          create: [
            { skillId: 1, importance: SkillImportance.REQUIRED, weight: 10 },
            { skillId: 2, importance: SkillImportance.PREFERRED, weight: 5 },
          ],
        },
      }),
      select: expect.objectContaining({ id: true, title: true }),
    });
    expect(result).toEqual({ id: 9, title: 'Backend Engineer' });
  });

  it('findAll scopes jobs to the company and applies filters and sort', async () => {
    dbMock.job.findMany.mockResolvedValue([]);

    await service.findAll(4, {
      search: 'engineer',
      status: JobStatus.DRAFT,
      sortBy: 'deadline',
    } as never);

    expect(dbMock.job.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 4,
        status: JobStatus.DRAFT,
        OR: [
          { title: { contains: 'engineer', mode: 'insensitive' } },
          { description: { contains: 'engineer', mode: 'insensitive' } },
          { location: { contains: 'engineer', mode: 'insensitive' } },
        ],
      }),
      orderBy: [{ applicationDeadline: 'asc' }, { createdAt: 'desc' }],
      select: expect.objectContaining({ id: true, title: true }),
    });
  });

  it('findOne throws NotFoundException when job does not exist', async () => {
    dbMock.job.findFirst.mockResolvedValue(null);

    await expect(service.findOne(4, 77)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update replaces skills, upserts ai config and returns refreshed job', async () => {
    dbMock.job.findFirst
      .mockResolvedValueOnce({
        id: 9,
        salaryMin: 100,
        salaryMax: 200,
        aiConfig: {
          minMatchScore: 70,
          autoShortlistThreshold: 80,
          enableAutoShortlist: true,
          enableAiInterview: false,
          aiInterviewThreshold: 90,
        },
      })
      .mockResolvedValueOnce({ id: 9, title: 'Updated Job' });
    dbMock.skill.findUnique.mockResolvedValue({ id: 1, category: 'Backend' });
    dbMock.jobSkill.createMany.mockResolvedValue({ count: 1 });
    dbMock.jobAiConfig.upsert.mockResolvedValue({ id: 1, jobId: 9 });
    dbMock.job.update.mockResolvedValue({ id: 9 });

    const result = await service.update(7, 4, 9, {
      title: 'Updated Job',
      skills: [
        {
          name: 'Node.js',
          category: 'Backend',
          importance: SkillImportance.REQUIRED,
          weight: 10,
        },
      ],
      aiConfig: {
        minMatchScore: 75,
        autoShortlistThreshold: 85,
        enableAutoShortlist: true,
        enableAiInterview: true,
        aiInterviewThreshold: 95,
      },
    } as never);

    expect(dbMock.job.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { title: 'Updated Job' },
    });
    expect(dbMock.jobSkill.deleteMany).toHaveBeenCalledWith({
      where: { jobId: 9 },
    });
    expect(dbMock.jobSkill.createMany).toHaveBeenCalledWith({
      data: [
        {
          jobId: 9,
          skillId: 1,
          importance: SkillImportance.REQUIRED,
          weight: 10,
        },
      ],
    });
    expect(dbMock.jobAiConfig.upsert).toHaveBeenCalledWith({
      where: { jobId: 9 },
      create: {
        jobId: 9,
        minMatchScore: 75,
        autoShortlistThreshold: 85,
        enableAutoShortlist: true,
        enableAiInterview: true,
        aiInterviewThreshold: 95,
      },
      update: {
        minMatchScore: 75,
        autoShortlistThreshold: 85,
        enableAutoShortlist: true,
        enableAiInterview: true,
        aiInterviewThreshold: 95,
      },
    });
    expect(result).toEqual({ id: 9, title: 'Updated Job' });
  });

  it('update throws NotFoundException when job does not belong to the company', async () => {
    dbMock.job.findFirst.mockResolvedValue(null);

    await expect(
      service.update(7, 4, 99, {
        title: 'Updated Job',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
