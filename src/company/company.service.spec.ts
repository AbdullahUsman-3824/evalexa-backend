import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompanyService } from './company.service';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';

describe('CompanyService', () => {
  let service: CompanyService;
  let usersService: {
    findOne: jest.Mock;
  };
  let dbMock: {
    company: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    dbMock = {
      company: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    dbMock.$transaction.mockImplementation(
      async (
        callback: (tx: {
          company: typeof dbMock.company;
          user: typeof dbMock.user;
        }) => Promise<unknown>,
      ) => callback({ company: dbMock.company, user: dbMock.user }),
    );

    usersService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: DatabaseService,
          useValue: dbMock,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create throws ConflictException when recruiter already has a company', async () => {
    usersService.findOne.mockResolvedValue({ id: 1, companyId: 17 });

    await expect(
      service.create(1, {
        name: 'Acme Inc',
        industry: 'Technology',
        companySize: '11-50',
        location: 'Lahore',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create stores company and links recruiter in the same transaction', async () => {
    usersService.findOne.mockResolvedValue({ id: 1, companyId: null });
    dbMock.company.create.mockResolvedValue({ id: 22, name: 'Acme Inc' });
    dbMock.user.update.mockResolvedValue({ id: 1, companyId: 22 });

    const dto = {
      name: 'Acme Inc',
      industry: 'Technology',
      companySize: '11-50',
      location: 'Lahore',
      logo: 'https://cdn.example.com/logo.png',
      website: 'https://acme.example.com',
      description: 'Hiring top engineers',
    };

    const result = await service.create(1, dto);

    expect(dbMock.$transaction).toHaveBeenCalled();
    expect(dbMock.company.create).toHaveBeenCalledWith({
      data: {
        ...dto,
        createdBy: 1,
      },
      select: expect.objectContaining({
        id: true,
        name: true,
        createdBy: true,
      }),
    });
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { companyId: 22 },
    });
    expect(result).toEqual({ id: 22, name: 'Acme Inc' });
  });

  it('findAll scopes companies by creator', async () => {
    dbMock.company.findMany.mockResolvedValue([]);

    await service.findAll(3);

    expect(dbMock.company.findMany).toHaveBeenCalledWith({
      where: { createdBy: 3 },
      orderBy: { createdAt: 'desc' },
      select: expect.objectContaining({ id: true, name: true }),
    });
  });

  it('findOne returns company when it exists for requester', async () => {
    dbMock.company.findFirst.mockResolvedValue({ id: 4, name: 'Globex' });

    const result = await service.findOne(9, 4);

    expect(result).toEqual({ id: 4, name: 'Globex' });
  });

  it('findOne throws NotFoundException when company is missing', async () => {
    dbMock.company.findFirst.mockResolvedValue(null);

    await expect(service.findOne(9, 404)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update throws NotFoundException when no owned record is updated', async () => {
    dbMock.company.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(7, 101, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update persists dto and returns refreshed company', async () => {
    dbMock.company.updateMany.mockResolvedValue({ count: 1 });
    dbMock.company.findFirst.mockResolvedValue({ id: 5, name: 'Updated Co' });

    const dto = { name: 'Updated Co', location: 'Karachi' };
    const result = await service.update(7, 5, dto);

    expect(dbMock.company.updateMany).toHaveBeenCalledWith({
      where: { id: 5, createdBy: 7 },
      data: dto,
    });
    expect(dbMock.company.findFirst).toHaveBeenCalledWith({
      where: { id: 5, createdBy: 7 },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(result).toEqual({ id: 5, name: 'Updated Co' });
  });

  it('remove throws NotFoundException when company does not exist', async () => {
    dbMock.company.findFirst.mockResolvedValue(null);

    await expect(service.remove(8, 77)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dbMock.user.updateMany).not.toHaveBeenCalled();
    expect(dbMock.company.delete).not.toHaveBeenCalled();
  });

  it('remove unlinks users and deletes owned company', async () => {
    dbMock.company.findFirst.mockResolvedValue({ id: 12, name: 'Delete Me' });
    dbMock.user.updateMany.mockResolvedValue({ count: 3 });
    dbMock.company.delete.mockResolvedValue({ id: 12 });

    const result = await service.remove(8, 12);

    expect(dbMock.user.updateMany).toHaveBeenCalledWith({
      where: { companyId: 12 },
      data: { companyId: null },
    });
    expect(dbMock.company.delete).toHaveBeenCalledWith({
      where: { id: 12 },
    });
    expect(result).toEqual({ id: 12, name: 'Delete Me' });
  });
});
