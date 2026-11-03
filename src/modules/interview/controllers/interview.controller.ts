import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '../../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RecruiterRoleGuard } from '../../company/guards/recruiter-role.guard';
import { InterviewService } from '../services/interview.service';
import {
  InterviewExtensionRequestQueryDto,
  ReviewInterviewExtensionRequestDto,
} from '../dto/interview-extension-request.dto';

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

  // GET /interviews/invitation-extension-requests
  @Get('invitation-extension-requests')
  getInvitationExtensionRequests(
    @User() user: JwtPayload,
    @Query() query: InterviewExtensionRequestQueryDto,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    return this.interviewService.getInvitationExtensionRequests(
      user.companyId,
      query,
    );
  }

  // POST /interviews/:interviewId/invitation-extension-requests/:requestId/approve
  @Post(':interviewId/invitation-extension-requests/:requestId/approve')
  approveInvitationExtensionRequest(
    @User() user: JwtPayload,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: ReviewInterviewExtensionRequestDto,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    return this.interviewService.approveInvitationExtensionRequest(
      user.companyId,
      user.sub,
      interviewId,
      requestId,
      body.decisionNote,
    );
  }

  // POST /interviews/:interviewId/invitation-extension-requests/:requestId/reject
  @Post(':interviewId/invitation-extension-requests/:requestId/reject')
  rejectInvitationExtensionRequest(
    @User() user: JwtPayload,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: ReviewInterviewExtensionRequestDto,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    return this.interviewService.rejectInvitationExtensionRequest(
      user.companyId,
      user.sub,
      interviewId,
      requestId,
      body.decisionNote,
    );
  }
}
