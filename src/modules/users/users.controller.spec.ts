import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to service', async () => {
    await controller.findAll();

    expect(usersService.findAll).toHaveBeenCalled();
  });

  it('findOne delegates numeric id to service', async () => {
    await controller.findOne('11111111-1111-1111-1111-111111111111');

    expect(usersService.findOne).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('update delegates id and dto to service', async () => {
    const dto = { fullName: 'Updated Name' };

    await controller.update('22222222-2222-2222-2222-222222222222', dto);

    expect(usersService.update).toHaveBeenCalledWith(
      '22222222-2222-2222-2222-222222222222',
      dto,
    );
  });

  it('remove delegates numeric id to service', async () => {
    await controller.remove('33333333-3333-3333-3333-333333333333');

    expect(usersService.remove).toHaveBeenCalledWith(
      '33333333-3333-3333-3333-333333333333',
    );
  });
});
