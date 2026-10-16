import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Receiver } from '@upstash/qstash';
import { ProcessingExecutorService } from './services/processing-executor.service';
import type {
  ApplicationTaskJobData,
  JobWideTaskJobData,
} from './interfaces/job-data.interface';

@Controller('worker')
export class WorkerController {
  private readonly logger = new Logger(WorkerController.name);
  private receiver: Receiver | null = null;

  constructor(private readonly executor: ProcessingExecutorService) {
    if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
      this.receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
      });
    }
  }

  private async verify(req: Request): Promise<boolean> {
    if (!this.receiver) return true; // local mode

    try {
      return await this.receiver.verify({
        signature: req.headers['upstash-signature'] as string,
        body: JSON.stringify(req.body),
      });
    } catch (err) {
      this.logger.error('QStash signature verification failed', err);
      return false;
    }
  }

  @Post('resume-parse')
  async resumeParse(
    @Req() req: Request,
    @Body() body: ApplicationTaskJobData,
    @Res() res: Response,
  ) {
    if (!(await this.verify(req))) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Invalid signature' });
    }

    const result = await this.executor.runResumeParse(body);
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('resume-analysis')
  async resumeAnalysis(
    @Req() req: Request,
    @Body() body: ApplicationTaskJobData,
    @Res() res: Response,
  ) {
    if (!(await this.verify(req))) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Invalid signature' });
    }

    const result = await this.executor.runResumeAnalysis(body);
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('ranking')
  async ranking(
    @Req() req: Request,
    @Body() body: JobWideTaskJobData,
    @Res() res: Response,
  ) {
    if (!(await this.verify(req))) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Invalid signature' });
    }

    const result = await this.executor.runRanking(body);
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('close-job')
  async closeJob(
    @Req() req: Request,
    @Body() body: { jobId: string },
    @Res() res: Response,
  ) {
    if (!(await this.verify(req))) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Invalid signature' });
    }

    try {
      const result = await this.executor.runCloseJob(body);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      // RANKING_NOT_READY → QStash retry karega
      this.logger.warn(`close-job failed for ${body.jobId}`, error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: error instanceof Error ? error.message : 'Failed',
      });
    }
  }
}
