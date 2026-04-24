import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from './decorators/user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  @Get()
  getProfile(@User() user: JwtPayload) {
    return user;
  }
}
