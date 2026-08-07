import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { DatabaseService } from '../../database/database.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';

describe('CandidateService', () => {
  let service: CandidateService;
  let dbMock: any;

  beforeEach(async () => {
    dbMock = {
      candidate: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateService,
        { provide: DatabaseService, useValue: dbMock },
      ],
    }).compile();

    service = module.get<CandidateService>(CandidateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createCandidate returns existing candidate when email matches', async () => {
    const dto: CreateCandidateDto = {
      fullName: 'Alice Doe',
      email: 'alice@example.com',
    } as any;

    dbMock.candidate.findFirst.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      fullName: 'Alice Doe',
    });

    const res = await service.createCandidate(dto);

    expect(dbMock.candidate.findFirst).toHaveBeenCalled();
    expect(res).toEqual({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      fullName: 'Alice Doe',
    });
  });

  it('createCandidate creates when not existing', async () => {
    const dto: CreateCandidateDto = {
      fullName: 'Bob Smith',
      email: 'bob@example.com',
    } as any;

    dbMock.candidate.findFirst.mockResolvedValue(null);
    dbMock.candidate.create.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fullName: 'Bob Smith',
    });

    const res = await service.createCandidate(dto);

    expect(dbMock.candidate.create).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.any(Object) }),
    );
    expect(res).toEqual({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fullName: 'Bob Smith',
    });
  });

  it('findByEmail returns null when email missing', async () => {
    const res = await service.findByEmail(undefined);
    expect(res).toBeNull();
  });

  it('getCandidateProfile throws NotFoundException when missing', async () => {
    dbMock.candidate.findUnique.mockResolvedValue(null);

    await expect(
      service.getCandidateProfile('cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateCandidate throws NotFoundException when id not found', async () => {
    dbMock.candidate.findUnique.mockResolvedValue(null);

    await expect(
      service.updateCandidate(
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        {} as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateCandidate calls update and returns selected fields', async () => {
    dbMock.candidate.findUnique.mockResolvedValue({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    });
    dbMock.candidate.update.mockResolvedValue({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      fullName: 'Updated',
    });

    const res = await service.updateCandidate(
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      {
        fullName: 'Updated',
      } as any,
    );

    expect(dbMock.candidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' },
      }),
    );
    expect(res).toEqual({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      fullName: 'Updated',
    });
  });
});
