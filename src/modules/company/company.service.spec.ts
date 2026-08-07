import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompanyService } from './company.service';
import { DatabaseService } from '../../database/database.service';
import { UsersService } from '../../users/users.service';

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
      findUnique: jest.Mock;
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
        findUnique: jest.fn(),
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
    usersService.findOne.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
    });

    await expect(
      service.create('11111111-1111-1111-1111-111111111111', {
        name: 'Acme Inc',
        industry: 'Technology',
        companySize: '11-50',
        location: 'Lahore',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create stores company and links recruiter in the same transaction', async () => {
    usersService.findOne.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      companyId: null,
    });
    dbMock.company.create.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Acme Inc',
      slug: 'acme-inc',
    });
    dbMock.company.findUnique.mockResolvedValue(null);
    dbMock.user.update.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
    });

    const dto = {
      name: 'Acme Inc',
      industry: 'Technology',
      companySize: '11-50',
      location: 'Lahore',
      logo: 'https://cdn.example.com/logo.png',
      website: 'https://acme.example.com',
      description: 'Hiring top engineers',
    };

    const result = await service.create(
      '11111111-1111-1111-1111-111111111111',
      dto,
    );

    expect(dbMock.$transaction).toHaveBeenCalled();
    expect(dbMock.company.create).toHaveBeenCalledWith({
      data: {
        ...dto,
        slug: 'acme-inc',
        createdBy: '11111111-1111-1111-1111-111111111111',
      },
      select: expect.objectContaining({
        id: true,
        name: true,
        slug: true,
        createdBy: true,
      }),
    });
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      data: { companyId: '22222222-2222-2222-2222-222222222222' },
    });
    expect(result).toEqual({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Acme Inc',
      slug: 'acme-inc',
    });
  });

  it('findAll scopes companies by creator', async () => {
    dbMock.company.findMany.mockResolvedValue([]);

    await service.findAll('33333333-3333-3333-3333-333333333333');

    expect(dbMock.company.findMany).toHaveBeenCalledWith({
      where: { createdBy: '33333333-3333-3333-3333-333333333333' },
      orderBy: { createdAt: 'desc' },
      select: expect.objectContaining({ id: true, name: true }),
    });
  });

  it('findOne returns company when it exists for requester', async () => {
    dbMock.company.findFirst.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Globex',
    });

    const result = await service.findOne(
      '99999999-9999-9999-9999-999999999999',
      '44444444-4444-4444-4444-444444444444',
    );

    expect(result).toEqual({
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Globex',
    });
  });

  it('findOne throws NotFoundException when company is missing', async () => {
    dbMock.company.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(
        '99999999-9999-9999-9999-999999999999',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update throws NotFoundException when no owned record is updated', async () => {
    dbMock.company.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(
        '77777777-7777-7777-7777-777777777777',
        '10101010-1010-1010-1010-101010101010',
        { name: 'New Name' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update persists dto and returns refreshed company', async () => {
    dbMock.company.updateMany.mockResolvedValue({ count: 1 });
    dbMock.company.findUnique.mockResolvedValue(null);
    dbMock.company.findFirst.mockResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Updated Co',
      slug: 'updated-co',
    });

    const dto = { name: 'Updated Co', location: 'Karachi' };
    const result = await service.update(
      '77777777-7777-7777-7777-777777777777',
      '55555555-5555-5555-5555-555555555555',
      dto,
    );

    expect(dbMock.company.updateMany).toHaveBeenCalledWith({
      where: {
        id: '55555555-5555-5555-5555-555555555555',
        createdBy: '77777777-7777-7777-7777-777777777777',
      },
      data: {
        ...dto,
        slug: 'updated-co',
      },
    });
    expect(dbMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: '55555555-5555-5555-5555-555555555555',
        createdBy: '77777777-7777-7777-7777-777777777777',
      },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(result).toEqual({
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Updated Co',
      slug: 'updated-co',
    });
  });

  it('remove throws NotFoundException when company does not exist', async () => {
    dbMock.company.findFirst.mockResolvedValue(null);

    await expect(
      service.remove(
        '88888888-8888-8888-8888-888888888888',
        '77777777-7777-7777-7777-777777777777',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dbMock.user.updateMany).not.toHaveBeenCalled();
    expect(dbMock.company.delete).not.toHaveBeenCalled();
  });

  it('remove unlinks users and deletes owned company', async () => {
    dbMock.company.findFirst.mockResolvedValue({
      id: '12121212-1212-1212-1212-121212121212',
      name: 'Delete Me',
    });
    dbMock.user.updateMany.mockResolvedValue({ count: 3 });
    dbMock.company.delete.mockResolvedValue({
      id: '12121212-1212-1212-1212-121212121212',
    });

    const result = await service.remove(
      '88888888-8888-8888-8888-888888888888',
      '12121212-1212-1212-1212-121212121212',
    );

    expect(dbMock.user.updateMany).toHaveBeenCalledWith({
      where: { companyId: '12121212-1212-1212-1212-121212121212' },
      data: { companyId: null },
    });
    expect(dbMock.company.delete).toHaveBeenCalledWith({
      where: { id: '12121212-1212-1212-1212-121212121212' },
    });
    expect(result).toEqual({
      id: '12121212-1212-1212-1212-121212121212',
      name: 'Delete Me',
    });
  });
});
