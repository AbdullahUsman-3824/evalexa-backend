import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface InterviewSessionPayload {
  sub: string;
  type: 'interview_session';
  iat?: number;
  exp?: number;
}

type InterviewRequest = Request & {
  interviewSession?: InterviewSessionPayload;
};

@Injectable()
export class InterviewSessionGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<InterviewRequest>();
    const token = request.cookies?.interview_session;

    if (!token) {
      throw new UnauthorizedException('Interview session token is required');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<InterviewSessionPayload>(token);

      if (!payload.sub || payload.type !== 'interview_session') {
        throw new UnauthorizedException('Invalid interview session token');
      }

      request.interviewSession = payload;
      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid interview session token');
    }
  }
}
