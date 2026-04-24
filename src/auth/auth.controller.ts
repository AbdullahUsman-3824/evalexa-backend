import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './decorators/user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @User() user: AuthenticatedUser | undefined,
  ) {
    const authenticatedUser =
      user ??
      (await this.authService.validateUser(loginDto.email, loginDto.password));

    return this.authService.login(authenticatedUser);
  }

  @UseGuards(JwtAuthGuard)
  @Get('session')
  getSession(@User() user: AuthenticatedUser) {
    return user;
  }
}
