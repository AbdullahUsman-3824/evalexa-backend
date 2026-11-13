import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  InterviewSessionGuard,
  InterviewSessionPayload,
} from '../guards/interview-session.guard';
import { PublicInterviewService } from '../services/public-interview.service';
import { SubmitInterviewAnswerDto } from '../dto/submit-interview-answer.dto';

type InterviewSessionRequest = Request & {
  interviewSession: InterviewSessionPayload;
};

@Controller('interviews')
@UseGuards(InterviewSessionGuard)
export class InterviewSessionController {
  constructor(
    private readonly publicInterviewService: PublicInterviewService,
  ) {}

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

  @Get(':id/session')
  getSessionInfo(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Req() request: InterviewSessionRequest,
  ) {
    return this.publicInterviewService.getSessionInfo(
      interviewId,
      request.interviewSession.sub,
    );
  }

  @Get(':id/questions/next')
  nextQuestion(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Req() request: InterviewSessionRequest,
  ) {
    return this.publicInterviewService.getNextQuestion(
      interviewId,
      request.interviewSession.sub,
    );
  }

  @Post(':id/questions/:questionId/recording/upload-url')
  generateRecordingUploadUrl(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Req() request: InterviewSessionRequest,
  ) {
    return this.publicInterviewService.generateRecordingUploadUrl(
      interviewId,
      questionId,
      request.interviewSession.sub,
    );
  }

  @Post(':id/questions/:questionId/answer')
  submitAnswer(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() body: SubmitInterviewAnswerDto,
    @Req() request: InterviewSessionRequest,
  ) {
    return this.publicInterviewService.submitAnswer(
      interviewId,
      questionId,
      request.interviewSession.sub,
      body,
    );
  }
}
