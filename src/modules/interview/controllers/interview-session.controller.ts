import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  InterviewSessionGuard,
  InterviewSessionPayload,
} from '../guards/interview-session.guard';
import { PublicInterviewService } from '../services/public-interview.service';

type InterviewSessionRequest = Request & {
  interviewSession: InterviewSessionPayload;
};

@Controller('interviews')
@UseGuards(InterviewSessionGuard)
export class InterviewSessionController {
  constructor(
    private readonly publicInterviewService: PublicInterviewService,
  ) {}

  // POST /interviews/:id/start
  @Post(':id/start')
  start(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Req() request: InterviewSessionRequest,
  ) {
    return this.publicInterviewService.startInterview(
      interviewId,
      request.interviewSession.sub,
    );
  }
}
