import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '../database/database.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let dbMock: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    dbMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: dbMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create hashes password, normalizes email and returns public fields', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'john@example.com',
    });

    await service.create({
      fullName: 'John Doe',
      email: '  JOHN@EXAMPLE.COM  ',
      password: 'password123',
      phone: '+923001234567',
    });

    expect(dbMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'john@example.com' },
    });

    const [createArgs] = dbMock.user.create.mock.calls[0] as [
      {
        data: {
          password: string;
          email: string;
          role: string;
          companyId: null;
        };
        select: Record<string, unknown>;
      },
    ];

    expect(createArgs.data.password).not.toBe('password123');
    expect(createArgs.data.password).toMatch(/^\$2[abxy]\$/);
    expect(createArgs.data.email).toBe('john@example.com');
    expect(createArgs.data.role).toBe('recruiter');
    expect(createArgs.data.companyId).toBeNull();
    expect(createArgs.select).not.toHaveProperty('password');
  });

  it('create throws BadRequestException when email already exists', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
    });

    await expect(
      service.create({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        phone: '+923001234567',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create maps unique constraint race (P2002) to BadRequestException', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        phone: '+923001234567',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findOne throws NotFoundException when user does not exist', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update hashes password and normalizes email before saving', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    dbMock.user.findFirst.mockResolvedValue(null);
    dbMock.user.update.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    await service.update('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
      email: '  NEW@EXAMPLE.COM ',
      password: 'newpassword123',
      fullName: 'Updated Name',
    });

    expect(dbMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'new@example.com',
        id: { not: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      },
      select: { id: true },
    });

    const [updateArgs] = dbMock.user.update.mock.calls[0] as [
      {
        data: { password: string; email: string };
        select: Record<string, unknown>;
      },
    ];

    expect(updateArgs.data.email).toBe('new@example.com');
    expect(updateArgs.data.password).not.toBe('newpassword123');
    expect(updateArgs.data.password).toMatch(/^\$2[abxy]\$/);
    expect(updateArgs.select).not.toHaveProperty('password');
  });

  it('update throws NotFoundException when target user does not exist', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);

    await expect(service.update('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', { fullName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update throws BadRequestException when new email belongs to another user', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
    });
    dbMock.user.findFirst.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
    });

    await expect(
      service.update('11111111-1111-1111-1111-111111111111', {
        email: 'taken@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update maps P2002 to BadRequestException', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
    });
    dbMock.user.findFirst.mockResolvedValue(null);
    dbMock.user.update.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.update('11111111-1111-1111-1111-111111111111', {
        email: 'new@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove maps relation constraint errors to ConflictException', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
    });
    dbMock.user.delete.mockRejectedValue({ code: 'P2003' });

    await expect(
      service.remove('55555555-5555-5555-5555-555555555555'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove throws NotFoundException when user does not exist', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);

    await expect(service.remove('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).rejects.toBeInstanceOf(NotFoundException);
  });
});
