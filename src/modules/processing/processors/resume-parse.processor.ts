import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ProcessingTaskType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ProcessingTaskService } from '../services/processing-task.service';
import { JobProcessingService } from '../services/job-processing.service';
import { ApplicationTaskJobData } from '../interfaces/job-data.interface';
import { DatabaseService } from '../../../database/database.service';
import { ResumeParserService } from '../../resume/resume-parser.service';
import { ResumeService } from '../../resume/resume.service';
import { CandidateService } from '../../candidate/candidate.service';

@Processor(QUEUE_NAMES.APPLICATION_PROCESSING, { concurrency: 10 })
export class ResumeParseProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeParseProcessor.name);

  constructor(
    private readonly taskService: ProcessingTaskService,
    private readonly jobProcessingService: JobProcessingService,
    private readonly db: DatabaseService,
    private readonly resumeParser: ResumeParserService,
    private readonly resumeService: ResumeService,
    private readonly candidateService: CandidateService,
    @InjectQueue(QUEUE_NAMES.APPLICATION_PROCESSING)
    private readonly appQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ApplicationTaskJobData>) {
    if (job.name !== 'resume-parse') return;

    const { applicationId, jobId, jobProcessingId, taskId } = job.data;

    await this.taskService.markRunning(taskId);

    try {
      const application = await this.db.application.findUnique({
        where: { id: applicationId },
        include: {
          resume: {
            select: {
              id: true,
              resumeUrl: true,
              fileName: true,
              candidateId: true,
            },
          },
        },
      });

      if (!application?.resume?.resumeUrl) {
        throw new Error('Application or resume file not found');
      }

      const { resume } = application;

      // Prefer URL parse (file already in storage)
      const parsed = await this.resumeParser.parseResume(
        resume.resumeUrl,
        resume.fileName ?? undefined,
      );

      await this.resumeService.saveParsedData(resume.id, parsed);

      // Enrich candidate from parsed basics when possible
      const email = parsed.basics?.email?.trim().toLowerCase() || undefined;
      const fullName =
        parsed.basics?.fullName?.trim() ||
        resume.fileName?.replace(/\.[^.]+$/, '') ||
        'Unknown Candidate';

      if (email) {
        const existing = await this.candidateService.findByEmail(email);
        if (existing && existing.id !== resume.candidateId) {
          // Another candidate already owns this email.
          // Keep current application candidate; optionally merge later.
          await this.candidateService.updateCandidate(resume.candidateId, {
            fullName,
            phone: parsed.basics?.phone || undefined,
            location: parsed.basics?.location || undefined,
          });
        } else {
          await this.candidateService.updateCandidate(resume.candidateId, {
            fullName,
            email,
            phone: parsed.basics?.phone || undefined,
            location: parsed.basics?.location || undefined,
          });
        }
      } else {
        await this.candidateService.updateCandidate(resume.candidateId, {
          fullName,
          phone: parsed.basics?.phone || undefined,
          location: parsed.basics?.location || undefined,
        });
      }

      await this.taskService.markCompleted(taskId);

      // Chain into existing scoring stage (do NOT markApplicationDone here)
      const analysisTask = await this.taskService.createApplicationTask(
        jobProcessingId,
        applicationId,
        ProcessingTaskType.RESUME_ANALYSIS,
      );

      await this.appQueue.add(
        'resume-analysis',
        {
          applicationId,
          jobId,
          jobProcessingId,
          taskId: analysisTask.id,
        },
        {
          jobId: `resume-analysis-${applicationId}-${analysisTask.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
    } catch (error) {
      this.logger.error(
        `Resume parse failed for application ${applicationId}: ${
          error instanceof Error ? error.message : error
        }`,
      );

      await this.taskService.markFailed(taskId, error);

      const { allDone, processed } =
        await this.jobProcessingService.markApplicationDone(jobId, false);

      if (!allDone) return;

      // Same gate as ResumeAnalysisProcessor: only one worker claims ranking
      const claimed = await this.jobProcessingService.claimRanking(jobId);
      if (!claimed) return;

      if (processed === 0) {
        await this.jobProcessingService.markJobWideNoSuccessfulApplications(
          jobId,
        );
        return;
      }

      // Some other apps already scored successfully — kick off ranking
      await this.appQueue.add(
        'ranking',
        { jobId, jobProcessingId },
        {
          jobId: `ranking-${jobId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        },
      );
    }
  }
}
