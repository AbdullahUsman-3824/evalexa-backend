import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

type RequestWithUser = Request & {
  user?: JwtPayload;
};

@Injectable()
export class RecruiterRoleGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const jwtUser = request.user;

    if (!jwtUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user context');
    }

    let user;

    try {
      user = await this.usersService.findOne(jwtUser.sub);
    } catch {
      throw new UnauthorizedException('Invalid authenticated user context');
    }

    const normalizedRole = user.role.trim().toLowerCase();

    if (!user.isActive || normalizedRole !== 'recruiter') {
      throw new ForbiddenException(
        'Only active recruiter accounts can access this resource',
      );
    }

    return true;
  }
}
