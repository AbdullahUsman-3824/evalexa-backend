import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../company/guards/recruiter-role.guard';
import { InterviewService } from './interview.service';

@Controller('interviews')
@UseGuards(JwtAuthGuard, RecruiterRoleGuard)
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  // GET /interviews/applications
  @Get('applications')
  getAllInterviewApplications(@User() user: JwtPayload) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    return this.interviewService.getAllInterviewApplications(user.companyId);
  }

  // POST /interviews/:id/invitations/send
  @Post(':id/invitations/send')
  sendInvitation(
    @User() user: JwtPayload,
    @Param('id', ParseUUIDPipe) interviewId: string,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    return this.interviewService.sendInvitation(user.companyId, interviewId);
  }
}
