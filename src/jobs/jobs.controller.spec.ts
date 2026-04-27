import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  let controller: JobsController;
  let jobsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    jobsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    controller = new JobsController(jobsService as unknown as JobsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create forwards authenticated user data and dto to the service', async () => {
    const user: JwtPayload = {
      sub: 7,
      email: 'recruiter@example.com',
      companyId: 4,
    };
    const dto = {
      title: 'Backend Engineer',
      description: 'Build APIs',
      jobType: 'full-time',
      experienceLevel: 'senior',
      salaryMin: 100,
      salaryMax: 200,
      location: 'Lahore',
      workModel: 'hybrid',
      applicationDeadline: new Date('2026-05-01T00:00:00.000Z'),
      skills: [],
      aiConfig: {
        minMatchScore: 70,
        autoShortlistThreshold: 80,
        enableAutoShortlist: true,
        enableAiInterview: false,
        aiInterviewThreshold: 90,
      },
    };

    await controller.create(user, dto as never);

    expect(jobsService.create).toHaveBeenCalledWith(7, 4, dto);
  });

  it('findAll forwards company id and query to the service', async () => {
    const user: JwtPayload = {
      sub: 7,
      email: 'recruiter@example.com',
      companyId: 4,
    };
    const query = { status: 'draft', sortBy: 'newest' };

    await controller.findAll(user, query as never);

    expect(jobsService.findAll).toHaveBeenCalledWith(4, query);
  });

  it('findOne forwards company id and job id to the service', async () => {
    const user: JwtPayload = {
      sub: 7,
      email: 'recruiter@example.com',
      companyId: 4,
    };

    await controller.findOne(user, 12);

    expect(jobsService.findOne).toHaveBeenCalledWith(4, 12);
  });

  it('update forwards authenticated user data, job id and dto to the service', async () => {
    const user: JwtPayload = {
      sub: 7,
      email: 'recruiter@example.com',
      companyId: 4,
    };
    const dto = { status: 'open' };

    await controller.update(user, 12, dto as never);

    expect(jobsService.update).toHaveBeenCalledWith(7, 4, 12, dto);
  });
});
