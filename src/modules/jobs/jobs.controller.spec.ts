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
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'recruiter@example.com',
      companyId: '44444444-4444-4444-4444-444444444444',
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
    expect(jobsService.create).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      dto,
    );
  });

  it('findAll forwards company id and query to the service', async () => {
    const user: JwtPayload = {
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'recruiter@example.com',
      companyId: '44444444-4444-4444-4444-444444444444',
    };
    const query = { status: 'draft', sortBy: 'newest' };

    await controller.findAll(user, query as never);
    expect(jobsService.findAll).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      query,
    );
  });

  it('findOne forwards company id and job id to the service', async () => {
    const user: JwtPayload = {
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'recruiter@example.com',
      companyId: '44444444-4444-4444-4444-444444444444',
    };

    await controller.findOne(user, '55555555-5555-5555-5555-555555555555');
    expect(jobsService.findOne).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '55555555-5555-5555-5555-555555555555',
    );
  });

  it('update forwards authenticated user data, job id and dto to the service', async () => {
    const user: JwtPayload = {
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'recruiter@example.com',
      companyId: '44444444-4444-4444-4444-444444444444',
    };
    const dto = { status: 'open' };

    await controller.update(
      user,
      '55555555-5555-5555-5555-555555555555',
      dto as never,
    );
    expect(jobsService.update).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '55555555-5555-5555-5555-555555555555',
      dto,
    );
  });
});
