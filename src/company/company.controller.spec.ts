import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('CompanyController', () => {
  let controller: CompanyController;
  let companyService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    companyService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    controller = new CompanyController(
      companyService as unknown as CompanyService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates authenticated user id and dto to service', async () => {
    const user: JwtPayload = { sub: 7, email: 'r@evalexa.com' };
    const dto = {
      name: 'Acme Inc',
      industry: 'Technology',
      companySize: '11-50',
      location: 'Lahore',
    };

    await controller.create(user, dto);

    expect(companyService.create).toHaveBeenCalledWith(7, dto);
  });

  it('findAll delegates authenticated user id to service', async () => {
    const user: JwtPayload = { sub: 11, email: 'r@evalexa.com' };

    await controller.findAll(user);

    expect(companyService.findAll).toHaveBeenCalledWith(11);
  });

  it('findOne delegates authenticated user id and company id', async () => {
    const user: JwtPayload = { sub: 11, email: 'r@evalexa.com' };

    await controller.findOne(user, 9);

    expect(companyService.findOne).toHaveBeenCalledWith(11, 9);
  });

  it('update delegates authenticated user id, company id and dto', async () => {
    const user: JwtPayload = { sub: 11, email: 'r@evalexa.com' };
    const dto = { name: 'Renamed' };

    await controller.update(user, 9, dto);

    expect(companyService.update).toHaveBeenCalledWith(11, 9, dto);
  });

  it('remove delegates authenticated user id and company id', async () => {
    const user: JwtPayload = { sub: 11, email: 'r@evalexa.com' };

    await controller.remove(user, 9);

    expect(companyService.remove).toHaveBeenCalledWith(11, 9);
  });
});
