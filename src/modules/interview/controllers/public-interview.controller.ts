import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  RequestOtpDto,
  ValidateTokenQueryDto,
  VerifyOtpDto,
} from '../dto/interview-access.dto';
import { PublicInterviewService } from '../services/public-interview.service';

@Controller('public/interviews')
export class PublicInterviewController {
  constructor(
    private readonly publicInterviewService: PublicInterviewService,
  ) {}

  // GET /public/interviews/:id/preview?token=<token>
  @Get(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Query() query: ValidateTokenQueryDto,
  ) {
    return this.publicInterviewService.previewInterview(
      interviewId,
      query.token,
    );
  }

  // POST /public/interviews/:id/request-otp
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/request-otp')
  requestOtp(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Body() body: RequestOtpDto,
  ) {
    return this.publicInterviewService.requestOtp(interviewId, body.token);
  }

  // POST /public/interviews/:id/verify-otp
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/verify-otp')
  async verifyOtp(
    @Param('id', ParseUUIDPipe) interviewId: string,
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { sessionToken, ...response } =
      await this.publicInterviewService.verifyOtp(
        interviewId,
        body.token,
        body.otp,
      );

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('interview_session', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 3600 * 1000, // 1 hour in ms
      path: '/',
    });

    return response;
  }
}
