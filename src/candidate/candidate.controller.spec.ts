import { CandidateController } from './candidate.controller';
import { CandidateService } from './candidate.service';

describe('CandidateController', () => {
  let controller: CandidateController;
  let candidateService: any;

  beforeEach(() => {
    candidateService = {
      createCandidate: jest.fn(),
      findByEmail: jest.fn(),
      getCandidateProfile: jest.fn(),
      updateCandidate: jest.fn(),
    };

    controller = new CandidateController(candidateService as CandidateService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createCandidate forwards dto to service', async () => {
    const dto = { fullName: 'Test' } as any;
    await controller.createCandidate(dto);
    expect(candidateService.createCandidate).toHaveBeenCalledWith(dto);
  });

  it('findByEmail forwards query param to service', async () => {
    await controller.findByEmail('x@y.com');
    expect(candidateService.findByEmail).toHaveBeenCalledWith('x@y.com');
  });

  it('getCandidateProfile forwards id to service', async () => {
    await controller.getCandidateProfile(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    expect(candidateService.getCandidateProfile).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
  });

  it('updateCandidate forwards id and dto to service', async () => {
    const dto = { fullName: 'Updated' } as any;
    await controller.updateCandidate(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      dto,
    );
    expect(candidateService.updateCandidate).toHaveBeenCalledWith(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      dto,
    );
  });
});
