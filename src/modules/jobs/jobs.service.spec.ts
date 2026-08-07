import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JobStatus, SkillImportance } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let dbMock: {
    job: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    company: {
      findUnique: jest.Mock;
    };
    skill: {
      findMany: jest.Mock;
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
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
      },
      skill: {
        findMany: jest.fn(),
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
          company: typeof dbMock.company;
          skill: typeof dbMock.skill;
          jobAiConfig: typeof dbMock.jobAiConfig;
          jobSkill: typeof dbMock.jobSkill;
        }) => Promise<unknown>,
      ) =>
        callback({
          job: dbMock.job,
          company: dbMock.company,
          skill: dbMock.skill,
          jobAiConfig: dbMock.jobAiConfig,
          jobSkill: dbMock.jobSkill,
        }),
    );

    const module = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: DatabaseService,
          useValue: dbMock,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create throws BadRequestException when salary range is invalid', async () => {
    await expect(
      service.create(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        {
          title: 'Backend Engineer',
          department: 'Engineering',
          description: 'Build APIs',
          responsibilities: 'Write code',
          jobType: 'full-time' as never,
          experienceLevel: 'senior' as never,
          salary: {
            min: 200,
            max: 100,
            currency: 'PKR',
            period: 'monthly' as never,
          },
          location: 'Lahore',
          workModel: 'hybrid' as never,
          applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
          skills: [],
          aiConfig: {
            enableAutoShortlist: true,
            resumeSelectionCount: 10,
            enableAiInterview: false,
            interviewSelectionCount: 5,
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create throws BadRequestException when recruiter has no company', async () => {
    await expect(
      service.create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, {
        title: 'Backend Engineer',
        department: 'Engineering',
        description: 'Build APIs',
        responsibilities: 'Write code',
        jobType: 'full-time' as never,
        experienceLevel: 'senior' as never,
        salary: {
          min: 100,
          max: 200,
          currency: 'PKR',
          period: 'monthly' as never,
        },
        location: 'Lahore',
        workModel: 'hybrid' as never,
        applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
        skills: [],
        aiConfig: {
          enableAutoShortlist: true,
          resumeSelectionCount: 10,
          enableAiInterview: false,
          interviewSelectionCount: 5,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create validates skill ids exist and passes them directly to job.create', async () => {
    dbMock.skill.findMany.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111' },
      { id: '22222222-2222-2222-2222-222222222222' },
    ]);
    dbMock.company.findUnique.mockResolvedValue({ name: 'Acme Inc' });
    dbMock.job.findUnique.mockResolvedValue(null);
    dbMock.job.create.mockResolvedValue({
      id: '99999999-9999-9999-9999-999999999999',
      title: 'Backend Engineer',
      slug: 'backend-engineer-at-acme-inc',
    });

    const dto = {
      title: 'Backend Engineer',
      department: 'Engineering',
      description: 'Build APIs',
      responsibilities: 'Write code',
      jobType: 'full-time' as never,
      experienceLevel: 'senior' as never,
      salary: {
        min: 100,
        max: 200,
        currency: 'PKR',
        period: 'monthly' as never,
      },
      location: 'Lahore',
      workModel: 'hybrid' as never,
      status: JobStatus.DRAFT,
      applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
      skills: [
        {
          skillId: '11111111-1111-1111-1111-111111111111',
          importance: SkillImportance.REQUIRED,
          weight: 10,
        },
        {
          skillId: '22222222-2222-2222-2222-222222222222',
          importance: SkillImportance.PREFERRED,
          weight: 5,
        },
      ],
      aiConfig: {
        enableAutoShortlist: true,
        resumeSelectionCount: 10,
        enableAiInterview: false,
        interviewSelectionCount: 5,
      },
    };

    const result = await service.create(
      '77777777-7777-7777-7777-777777777777',
      '44444444-4444-4444-4444-444444444444',
      dto as never,
    );

    expect(dbMock.$transaction).toHaveBeenCalled();

    // ensureSkillsExist should query by id, not name
    expect(dbMock.skill.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
          ],
        },
      },
      select: { id: true },
    });

    // no skill creation should happen
    expect(dbMock.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: '44444444-4444-4444-4444-444444444444',
        createdBy: '77777777-7777-7777-7777-777777777777',
        slug: 'backend-engineer-at-acme-inc',
        department: 'Engineering',
        salaryMin: 100,
        salaryMax: 200,
        salaryCurrency: 'PKR',
        status: JobStatus.DRAFT,
        jobSkills: {
          create: [
            {
              skillId: '11111111-1111-1111-1111-111111111111',
              importance: SkillImportance.REQUIRED,
              weight: 10,
            },
            {
              skillId: '22222222-2222-2222-2222-222222222222',
              importance: SkillImportance.PREFERRED,
              weight: 5,
            },
          ],
        },
      }),
      select: expect.objectContaining({ id: true, title: true }),
    });

    expect(result).toEqual({
      id: '99999999-9999-9999-9999-999999999999',
      title: 'Backend Engineer',
      slug: 'backend-engineer-at-acme-inc',
    });
  });

  it('create throws BadRequestException when a skill id does not exist', async () => {
    dbMock.skill.findMany.mockResolvedValue([]);
    dbMock.company.findUnique.mockResolvedValue({ name: 'Acme Inc' });
    dbMock.job.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        '77777777-7777-7777-7777-777777777777',
        '44444444-4444-4444-4444-444444444444',
        {
          title: 'Backend Engineer',
          department: 'Engineering',
          description: 'Build APIs',
          responsibilities: 'Write code',
          jobType: 'full-time' as never,
          experienceLevel: 'senior' as never,
          salary: {
            min: 100,
            max: 200,
            currency: 'PKR',
            period: 'monthly' as never,
          },
          location: 'Lahore',
          workModel: 'hybrid' as never,
          applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
          skills: [
            {
              skillId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
              importance: SkillImportance.REQUIRED,
              weight: 10,
            },
          ],
          aiConfig: {
            enableAutoShortlist: true,
            resumeSelectionCount: 10,
            enableAiInterview: false,
            interviewSelectionCount: 5,
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dbMock.job.create).not.toHaveBeenCalled();
  });

  it('findAll scopes jobs to the company and applies filters and sort', async () => {
    dbMock.job.findMany.mockResolvedValue([]);

    await service.findAll('44444444-4444-4444-4444-444444444444', {
      search: 'engineer',
      status: JobStatus.DRAFT,
      sortBy: 'deadline',
    } as never);

    expect(dbMock.job.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: '44444444-4444-4444-4444-444444444444',
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

    await expect(
      service.findOne(
        '44444444-4444-4444-4444-444444444444',
        '77777777-7777-7777-7777-777777777777',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update replaces skills, upserts ai config and returns refreshed job', async () => {
    dbMock.job.findFirst
      .mockResolvedValueOnce({
        id: '99999999-9999-9999-9999-999999999999',
        title: 'Backend Engineer',
        salaryMin: 100,
        salaryMax: 200,
        company: { name: 'Acme Inc' },
        aiConfig: {
          enableAutoShortlist: true,
          resumeSelectionCount: 10,
          enableAiInterview: false,
          interviewSelectionCount: 5,
        },
      })
      .mockResolvedValueOnce({
        id: '99999999-9999-9999-9999-999999999999',
        title: 'Updated Job',
        slug: 'updated-job-at-acme-inc',
      });

    dbMock.job.findUnique.mockResolvedValue(null);
    dbMock.job.update.mockResolvedValue({
      id: '99999999-9999-9999-9999-999999999999',
    });
    dbMock.skill.findMany.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111' },
    ]);
    dbMock.jobSkill.deleteMany.mockResolvedValue({ count: 1 });
    dbMock.jobSkill.createMany.mockResolvedValue({ count: 1 });
    dbMock.jobAiConfig.upsert.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      jobId: '99999999-9999-9999-9999-999999999999',
    });

    const result = await service.update(
      '77777777-7777-7777-7777-777777777777',
      '44444444-4444-4444-4444-444444444444',
      '99999999-9999-9999-9999-999999999999',
      {
        title: 'Updated Job',
        skills: [
          {
            skillId: '11111111-1111-1111-1111-111111111111',
            importance: SkillImportance.REQUIRED,
            weight: 10,
          },
        ],
        aiConfig: {
          enableAutoShortlist: true,
          resumeSelectionCount: 15,
          enableAiInterview: true,
          interviewSelectionCount: 8,
        },
      } as never,
    );

    expect(dbMock.skill.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['11111111-1111-1111-1111-111111111111'] } },
      select: { id: true },
    });

    expect(dbMock.jobSkill.deleteMany).toHaveBeenCalledWith({
      where: { jobId: '99999999-9999-9999-9999-999999999999' },
    });

    expect(dbMock.jobSkill.createMany).toHaveBeenCalledWith({
      data: [
        {
          jobId: '99999999-9999-9999-9999-999999999999',
          skillId: '11111111-1111-1111-1111-111111111111',
          importance: SkillImportance.REQUIRED,
          weight: 10,
        },
      ],
    });

    expect(dbMock.jobAiConfig.upsert).toHaveBeenCalledWith({
      where: { jobId: '99999999-9999-9999-9999-999999999999' },
      create: {
        jobId: '99999999-9999-9999-9999-999999999999',
        enableAutoShortlist: true,
        resumeSelectionCount: 15,
        enableAiInterview: true,
        interviewSelectionCount: 8,
      },
      update: {
        enableAutoShortlist: true,
        resumeSelectionCount: 15,
        enableAiInterview: true,
        interviewSelectionCount: 8,
      },
    });

    expect(dbMock.job.update).toHaveBeenCalledWith({
      where: { id: '99999999-9999-9999-9999-999999999999' },
      data: expect.objectContaining({
        title: 'Updated Job',
        slug: 'updated-job-at-acme-inc',
      }),
    });

    expect(result).toEqual({
      id: '99999999-9999-9999-9999-999999999999',
      title: 'Updated Job',
      slug: 'updated-job-at-acme-inc',
    });
  });

  it('update throws NotFoundException when job does not belong to the company', async () => {
    dbMock.job.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        '77777777-7777-7777-7777-777777777777',
        '44444444-4444-4444-4444-444444444444',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        { title: 'Updated Job' } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
