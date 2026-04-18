import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
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

  it('create delegates to service', () => {
    const dto = {
      fullName: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      phone: '+923001234567',
    };

    controller.create(dto);

    expect(usersService.create).toHaveBeenCalledWith(dto);
  });

  it('findAll delegates to service', () => {
    controller.findAll();

    expect(usersService.findAll).toHaveBeenCalled();
  });

  it('findOne delegates numeric id to service', () => {
    controller.findOne(7);

    expect(usersService.findOne).toHaveBeenCalledWith(7);
  });

  it('update delegates id and dto to service', () => {
    const dto = { fullName: 'Updated Name' };

    controller.update(9, dto);

    expect(usersService.update).toHaveBeenCalledWith(9, dto);
  });

  it('remove delegates numeric id to service', () => {
    controller.remove(3);

    expect(usersService.remove).toHaveBeenCalledWith(3);
  });
});
