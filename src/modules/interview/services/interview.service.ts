import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  EvaluationStatus,
  ExtensionRequestStatus,
  InterviewStatus,
  InvitationDeliveryStatus,
  Prisma,
  TranscriptionStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { MailService } from '../../auth/mail.service';
import type { InterviewExtensionRequestQueryDto } from '../dto/interview-extension-request.dto';

type InterviewDatabaseClient = DatabaseService | Prisma.TransactionClient;

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /interviews/applications
  // ─────────────────────────────────────────────────────────────────────────────

  async getAllInterviewApplications(companyId: string) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    const applications = await this.db.application.findMany({
      where: {
        companyId,
        status: ApplicationStatus.INTERVIEW,
        OR: [
          { interviews: { none: {} } },
          { interviews: { every: { status: InterviewStatus.PENDING } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        candidate: {
          select: {
            fullName: true,
            email: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        interviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            invitation: {
              select: {
                id: true,
                expiresAt: true,
                deliveryStatus: true,
              },
            },
          },
        },
      },
    });

    const result = await Promise.all(
      applications.map(async (application) => {
        const interview =
          application.interviews[0] ??
          (await this.db.interview.create({
            data: {
              applicationId: application.id,
              language: 'en',
            },
            select: {
              id: true,
              invitation: {
                select: {
                  id: true,
                  expiresAt: true,
                  deliveryStatus: true,
                },
              },
            },
          }));

        const invitationDeliveryStatus = interview.invitation
          ? await this.updateInvitationStatusIfExpired(interview.invitation)
          : null;

        return {
          id: application.id,
          interviewId: interview.id,
          jobId: application.job.id,
          candidateName: application.candidate.fullName,
          candidateEmail: application.candidate.email,
          jobTitle: application.job.title,
          invitationDeliveryStatus,
        };
      }),
    );

    return {
      success: true,
      data: result,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /interviews/results
  // ─────────────────────────────────────────────────────────────────────────────

  async getInterviewResults(companyId: string) {
    if (!companyId) {
      throw new BadRequestException('Recruiter must belong to a company');
    }

    // ── TEMP MOCK: set to false to restore real data ──────────────
    const USE_MOCK_RESULTS = true;
    if (USE_MOCK_RESULTS) {
      return this.getInterviewResultsMock();
    }

    const interviews = await this.db.interview.findMany({
      where: {
        application: { companyId },
        status: {
          in: [InterviewStatus.IN_PROGRESS, InterviewStatus.COMPLETED],
        },
      },
      orderBy: [
        { submittedAt: 'desc' },
        { startedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
        transcriptionStatus: true,
        evaluationStatus: true,
        overallScore: true,
        overallMaxScore: true,
        overallPercentage: true,
        overallFeedback: true,
        recommendation: true,
        evaluatedAt: true,
        application: {
          select: {
            id: true,
            candidate: {
              select: {
                fullName: true,
                email: true,
              },
            },
            job: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    const data = interviews.map((interview) => {
      const timeTakenSeconds =
        interview.startedAt && interview.submittedAt
          ? Math.max(
              0,
              Math.round(
                (interview.submittedAt.getTime() -
                  interview.startedAt.getTime()) /
                  1000,
              ),
            )
          : null;

      const processing = this.deriveProcessingStatus(
        interview.status,
        interview.transcriptionStatus,
        interview.evaluationStatus,
      );

      const base = {
        interviewId: interview.id,
        applicationId: interview.application.id,
        jobId: interview.application.job.id,
        candidateName: interview.application.candidate.fullName,
        candidateEmail: interview.application.candidate.email,
        jobTitle: interview.application.job.title,
        status: interview.status, // IN_PROGRESS | COMPLETED
        startedAt: interview.startedAt,
        submittedAt: interview.submittedAt,
        completedAt: interview.completedAt,
        timeTakenSeconds,
        processingStatus: processing.status,
        processingLabel: processing.label,
        transcriptionStatus: interview.transcriptionStatus,
        evaluationStatus: interview.evaluationStatus,
      };

      // Scores only when evaluation has produced results
      const evaluationReady =
        interview.evaluationStatus === EvaluationStatus.COMPLETED ||
        interview.evaluationStatus === EvaluationStatus.PARTIALLY_COMPLETED;

      if (evaluationReady) {
        return {
          ...base,
          scores: {
            overallScore: interview.overallScore
              ? Number(interview.overallScore)
              : null,
            overallMaxScore: interview.overallMaxScore
              ? Number(interview.overallMaxScore)
              : null,
            overallPercentage: interview.overallPercentage
              ? Number(interview.overallPercentage)
              : null,
          },
          feedback: interview.overallFeedback,
          recommendation: interview.recommendation,
          evaluatedAt: interview.evaluatedAt,
        };
      }

      return {
        ...base,
        scores: null,
        feedback: null,
        recommendation: null,
        evaluatedAt: interview.evaluatedAt,
      };
    });

    return {
      success: true,
      data,
    };
  }

  /**
   * Maps transcription + evaluation pipeline state into a single recruiter-facing status.
   */
  private deriveProcessingStatus(
    interviewStatus: InterviewStatus,
    transcriptionStatus: TranscriptionStatus,
    evaluationStatus: EvaluationStatus,
  ): { status: string; label: string } {
    if (interviewStatus === InterviewStatus.IN_PROGRESS) {
      return {
        status: 'candidate_in_progress',
        label: 'Candidate answering',
      };
    }

    // InterviewStatus.COMPLETED — answers submitted; pipeline may still be running
    if (
      transcriptionStatus === TranscriptionStatus.PENDING ||
      transcriptionStatus === TranscriptionStatus.PROCESSING
    ) {
      return {
        status: 'transcribing',
        label: 'Transcribing answers',
      };
    }

    if (
      evaluationStatus === EvaluationStatus.PENDING ||
      evaluationStatus === EvaluationStatus.PROCESSING
    ) {
      return {
        status: 'evaluating',
        label: 'Evaluating answers',
      };
    }

    if (evaluationStatus === EvaluationStatus.COMPLETED) {
      return {
        status: 'ready',
        label: 'Results ready',
      };
    }

    if (evaluationStatus === EvaluationStatus.PARTIALLY_COMPLETED) {
      return {
        status: 'partial',
        label: 'Partial results',
      };
    }

    if (
      transcriptionStatus === TranscriptionStatus.FAILED ||
      evaluationStatus === EvaluationStatus.FAILED
    ) {
      return {
        status: 'failed',
        label: 'Processing failed',
      };
    }

    if (transcriptionStatus === TranscriptionStatus.PARTIALLY_COMPLETED) {
      return {
        status: 'transcribing_partial',
        label: 'Partial transcription',
      };
    }

    return {
      status: 'unknown',
      label: 'Unknown',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /interviews/:id/invitations/send
  // ─────────────────────────────────────────────────────────────────────────────

  async sendInvitation(
    companyId: string,
    interviewId: string,
    db: InterviewDatabaseClient = this.db,
    requireEligibleInterview = false,
  ) {
    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        status: true,
        application: {
          select: {
            companyId: true,
            status: true,
            candidate: {
              select: {
                fullName: true,
                email: true,
              },
            },
            company: {
              select: {
                name: true,
              },
            },
            job: {
              select: {
                title: true,
              },
            },
          },
        },
        invitation: {
          select: {
            id: true,
            expiresAt: true,
            deliveryStatus: true,
            verifiedAt: true,
            sentAt: true,
          },
        },
      },
    });

    // Return 404 so the interview ID is not enumerable across companies
    if (!interview || interview.application.companyId !== companyId) {
      throw new NotFoundException('Interview not found');
    }

    if (interview.application.status !== ApplicationStatus.INTERVIEW) {
      throw new BadRequestException(
        'Invitations can only be sent for applications in INTERVIEW status',
      );
    }
    if (
      requireEligibleInterview &&
      interview.status !== InterviewStatus.PENDING &&
      interview.status !== InterviewStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Invitations cannot be sent for an interview that is no longer available',
      );
    }

    // Normalize existing invitation status (marks it EXPIRED if needed)
    const existing = interview.invitation
      ? {
          ...interview.invitation,
          deliveryStatus: await this.updateInvitationStatusIfExpired(
            interview.invitation,
            db,
          ),
        }
      : null;

    // Prevent sending while a valid (non-expired) invitation still exists
    if (
      existing &&
      existing.deliveryStatus !== InvitationDeliveryStatus.EXPIRED &&
      existing.expiresAt.getTime() > Date.now()
    ) {
      throw new BadRequestException(
        'An invitation has already been sent and is still valid. Wait until it expires before sending again.',
      );
    }

    const email = interview.application.candidate.email;
    if (!email) {
      throw new BadRequestException('Candidate does not have an email address');
    }

    // Generate a new secure token every time (first send or resend)
    const rawToken = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

    const baseUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : 'http://localhost:3000';
    const interviewLink = `${baseUrl}/interviews/${interview.id}?token=${rawToken}`;

    const isResend = !!existing;

    // Create or update invitation
    // - Always generates a new token (invalidates previous one)
    // - Resets OTP / verification state
    // - Sets deliveryStatus to PENDING until email succeeds
    await db.interviewInvitation.upsert({
      where: { interviewId: interview.id },
      create: {
        interviewId: interview.id,
        tokenHash,
        expiresAt,
        deliveryStatus: InvitationDeliveryStatus.PENDING,
      },
      update: {
        tokenHash, // new token → old token is now invalid
        expiresAt, // reset expiry
        deliveryStatus: InvitationDeliveryStatus.PENDING,
        sentAt: null,
        verifiedAt: null,
        otpHash: null,
        otpExpiresAt: null,
        otpSentAt: null,
        otpAttempts: 0,
      },
    });

    try {
      await this.mailService.sendInterviewInvitation(
        email,
        interviewLink,
        expiresAt,
        interview.application.company.name,
        interview.application.job.title,
      );
    } catch (error: unknown) {
      // Mark as FAILED if email sending fails
      await db.interviewInvitation.update({
        where: { interviewId: interview.id },
        data: { deliveryStatus: InvitationDeliveryStatus.FAILED },
      });

      this.logger.error(
        `Failed to send interview invitation for interview ${interview.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }

    // Email succeeded → mark as SENT and set sentAt
    const invitation = await db.interviewInvitation.update({
      where: { interviewId: interview.id },
      data: {
        deliveryStatus: InvitationDeliveryStatus.SENT,
        sentAt: new Date(),
      },
      select: {
        id: true,
        deliveryStatus: true,
        expiresAt: true,
        sentAt: true,
      },
    });

    return {
      success: true,
      message: isResend
        ? 'New interview invitation sent to candidate (previous invitation invalidated).'
        : 'Interview invitation sent to candidate.',
      data: {
        ...invitation,
        isResend,
      },
    };
  }

  async updateInvitationStatusIfExpired(
    invitation: {
      id: string;
      expiresAt: Date;
      deliveryStatus: InvitationDeliveryStatus;
    },
    db: InterviewDatabaseClient = this.db,
  ) {
    if (
      invitation.deliveryStatus === InvitationDeliveryStatus.EXPIRED ||
      invitation.expiresAt.getTime() > Date.now()
    ) {
      return invitation.deliveryStatus;
    }

    await db.interviewInvitation.update({
      where: { id: invitation.id },
      data: { deliveryStatus: InvitationDeliveryStatus.EXPIRED },
    });

    return InvitationDeliveryStatus.EXPIRED;
  }

  async getInvitationExtensionRequests(
    companyId: string,
    query: InterviewExtensionRequestQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      status: query.status,
      interview: { application: { companyId } },
    };

    const [requests, total] = await Promise.all([
      this.db.interviewExtensionRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: this.extensionRequestSelect,
      }),
      this.db.interviewExtensionRequest.count({ where }),
    ]);

    return {
      success: true,
      data: requests.map((request) => this.serializeExtensionRequest(request)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  async approveInvitationExtensionRequest(
    companyId: string,
    reviewerId: string,
    interviewId: string,
    requestId: string,
    decisionNote?: string,
  ) {
    return this.db.$transaction(async (transaction) => {
      await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${interviewId}))
    `;

      const request = await transaction.interviewExtensionRequest.findFirst({
        where: {
          id: requestId,
          interviewId,
          status: ExtensionRequestStatus.PENDING,
          interview: { application: { companyId } },
        },
      });

      if (!request) {
        throw new NotFoundException(
          'Pending invitation extension request not found',
        );
      }

      const invitation = await this.sendInvitation(
        companyId,
        interviewId,
        transaction,
        true,
      );

      const updatedRequest = await transaction.interviewExtensionRequest.update(
        {
          where: { id: requestId },
          data: {
            status: ExtensionRequestStatus.APPROVED,
            reviewedAt: new Date(),
            reviewedById: reviewerId,
            decisionNote: decisionNote ?? null,
          },
        },
      );

      return {
        success: true,
        data: {
          request: updatedRequest,
          invitation: invitation.data,
        },
      };
    });
  }

  async rejectInvitationExtensionRequest(
    companyId: string,
    reviewerId: string,
    interviewId: string,
    requestId: string,
    decisionNote?: string,
  ) {
    return this.db.$transaction(async (transaction) => {
      await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${interviewId}))
    `;

      const request = await transaction.interviewExtensionRequest.findFirst({
        where: {
          id: requestId,
          interviewId,
          status: ExtensionRequestStatus.PENDING,
          interview: { application: { companyId } },
        },
      });

      if (!request) {
        throw new NotFoundException(
          'Pending invitation extension request not found',
        );
      }

      const updatedRequest = await transaction.interviewExtensionRequest.update(
        {
          where: { id: requestId },
          data: {
            status: ExtensionRequestStatus.REJECTED,
            reviewedAt: new Date(),
            reviewedById: reviewerId,
            decisionNote: decisionNote ?? null,
          },
        },
      );

      return {
        success: true,
        data: updatedRequest,
      };
    });
  }

  private readonly extensionRequestSelect = {
    id: true,
    interviewId: true,
    reason: true,
    status: true,
    requestedAt: true,
    reviewedAt: true,
    decisionNote: true,
    reviewedBy: { select: { id: true, fullName: true, email: true } },
    interview: {
      select: {
        application: {
          select: {
            candidate: { select: { fullName: true, email: true } },
            job: { select: { title: true } },
          },
        },
      },
    },
  } satisfies Prisma.InterviewExtensionRequestSelect;

  private serializeExtensionRequest(request: {
    id: string;
    interviewId: string;
    reason: string;
    status: ExtensionRequestStatus;
    requestedAt: Date;
    reviewedAt: Date | null;
    decisionNote: string | null;
    reviewedBy: { id: string; fullName: string; email: string } | null;
    interview: {
      application: {
        candidate: { fullName: string; email: string | null };
        job: { title: string };
      };
    };
  }) {
    return {
      id: request.id,
      interviewId: request.interviewId,
      candidateName: request.interview.application.candidate.fullName,
      candidateEmail: request.interview.application.candidate.email,
      jobTitle: request.interview.application.job.title,
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reviewer: request.reviewedBy,
      decisionNote: request.decisionNote,
    };
  }

  /** TEMP — delete or stop calling when frontend is done. */
  private getInterviewResultsMock() {
    const now = new Date();
    const mins = (m: number) => new Date(now.getTime() - m * 60_000);

    const row = (
      partial: Record<string, unknown> & {
        candidateName: string;
        status: string;
        processingStatus: string;
        processingLabel: string;
      },
    ) => ({
      interviewId: crypto.randomUUID(),
      applicationId: crypto.randomUUID(),
      jobId: crypto.randomUUID(),
      candidateEmail: `${partial.candidateName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      jobTitle: 'Senior Software Engineer',
      startedAt: mins(90),
      submittedAt: null as Date | null,
      completedAt: null as Date | null,
      timeTakenSeconds: null as number | null,
      transcriptionStatus: 'PENDING',
      evaluationStatus: 'PENDING',
      scores: null as null | {
        overallScore: number;
        overallMaxScore: number;
        overallPercentage: number;
      },
      feedback: null as string | null,
      recommendation: null as string | null,
      evaluatedAt: null as Date | null,
      ...partial,
    });

    return {
      success: true,
      data: [
        // 1. Candidate still answering
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Alex In Progress',
          status: 'IN_PROGRESS',
          processingStatus: 'candidate_in_progress',
          processingLabel: 'Candidate answering',
          startedAt: mins(20),
        }),

        // 2. Submitted — transcription running
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Sam Transcribing',
          status: 'COMPLETED',
          processingStatus: 'transcribing',
          processingLabel: 'Transcribing answers',
          submittedAt: mins(15),
          timeTakenSeconds: 2700,
          transcriptionStatus: 'PROCESSING',
        }),

        // 3. Transcription pending (just submitted)
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Jordan Pending Tx',
          status: 'COMPLETED',
          processingStatus: 'transcribing',
          processingLabel: 'Transcribing answers',
          submittedAt: mins(5),
          timeTakenSeconds: 1800,
          transcriptionStatus: 'PENDING',
        }),

        // 4. Transcription done — evaluation running
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Casey Evaluating',
          status: 'COMPLETED',
          processingStatus: 'evaluating',
          processingLabel: 'Evaluating answers',
          submittedAt: mins(40),
          timeTakenSeconds: 3200,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'PROCESSING',
        }),

        // 5. Evaluation pending after transcription
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Riley Eval Pending',
          status: 'COMPLETED',
          processingStatus: 'evaluating',
          processingLabel: 'Evaluating answers',
          submittedAt: mins(50),
          timeTakenSeconds: 2400,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'PENDING',
        }),

        // 6. Fully ready — strong recommend
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Taylor Ready Strong',
          status: 'COMPLETED',
          processingStatus: 'ready',
          processingLabel: 'Results ready',
          submittedAt: mins(120),
          completedAt: mins(100),
          timeTakenSeconds: 3600,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'COMPLETED',
          scores: {
            overallScore: 46,
            overallMaxScore: 50,
            overallPercentage: 92,
          },
          recommendation: 'STRONGLY_RECOMMENDED',
          evaluatedAt: mins(100),
          feedback: null,
        }),

        // 7. Ready — recommend
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Morgan Recommended',
          status: 'COMPLETED',
          processingStatus: 'ready',
          processingLabel: 'Results ready',
          submittedAt: mins(180),
          completedAt: mins(150),
          timeTakenSeconds: 2900,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'COMPLETED',
          scores: {
            overallScore: 38,
            overallMaxScore: 50,
            overallPercentage: 76,
          },
          recommendation: 'RECOMMENDED',
          evaluatedAt: mins(150),
        }),

        // 8. Ready — neutral
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Quinn Neutral',
          status: 'COMPLETED',
          processingStatus: 'ready',
          processingLabel: 'Results ready',
          submittedAt: mins(200),
          completedAt: mins(170),
          timeTakenSeconds: 3100,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'COMPLETED',
          scores: {
            overallScore: 28,
            overallMaxScore: 50,
            overallPercentage: 56,
          },
          recommendation: 'NEUTRAL',
          evaluatedAt: mins(170),
        }),

        // 9. Ready — not recommended
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Avery Not Rec',
          status: 'COMPLETED',
          processingStatus: 'ready',
          processingLabel: 'Results ready',
          submittedAt: mins(220),
          completedAt: mins(190),
          timeTakenSeconds: 2100,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'COMPLETED',
          scores: {
            overallScore: 18,
            overallMaxScore: 50,
            overallPercentage: 36,
          },
          recommendation: 'NOT_RECOMMENDED',
          evaluatedAt: mins(190),
        }),

        // 10. Ready — strongly not recommended
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Blake Strong No',
          status: 'COMPLETED',
          processingStatus: 'ready',
          processingLabel: 'Results ready',
          submittedAt: mins(240),
          completedAt: mins(210),
          timeTakenSeconds: 1500,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'COMPLETED',
          scores: {
            overallScore: 8,
            overallMaxScore: 50,
            overallPercentage: 16,
          },
          recommendation: 'STRONGLY_NOT_RECOMMENDED',
          evaluatedAt: mins(210),
        }),

        // 11. Partial evaluation
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Parker Partial',
          status: 'COMPLETED',
          processingStatus: 'partial',
          processingLabel: 'Partial results',
          submittedAt: mins(130),
          completedAt: mins(110),
          timeTakenSeconds: 2800,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'PARTIALLY_COMPLETED',
          scores: {
            overallScore: 22,
            overallMaxScore: 40,
            overallPercentage: 55,
          },
          recommendation: 'NEUTRAL',
          evaluatedAt: mins(110),
        }),

        // 12. Transcription failed
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Jamie Tx Failed',
          status: 'COMPLETED',
          processingStatus: 'failed',
          processingLabel: 'Processing failed',
          submittedAt: mins(60),
          timeTakenSeconds: 2000,
          transcriptionStatus: 'FAILED',
          evaluationStatus: 'PENDING',
        }),

        // 13. Evaluation failed
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Drew Eval Failed',
          status: 'COMPLETED',
          processingStatus: 'failed',
          processingLabel: 'Processing failed',
          submittedAt: mins(80),
          timeTakenSeconds: 2500,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'FAILED',
        }),

        // 14. Partial transcription
        row({
          jobId: 'acca937f-55fa-4699-aca8-3634cd40f465',
          candidateName: 'Cameron Tx Partial',
          status: 'COMPLETED',
          processingStatus: 'transcribing_partial',
          processingLabel: 'Partial transcription',
          submittedAt: mins(70),
          timeTakenSeconds: 2300,
          transcriptionStatus: 'PARTIALLY_COMPLETED',
          evaluationStatus: 'PENDING',
        }),

        // 15. Different job title
        row({
          jobId: '142a5a6e-c087-4f23-b08e-eca9e89aecb8',
          candidateName: 'Sky Other Role',
          status: 'COMPLETED',
          processingStatus: 'ready',
          processingLabel: 'Results ready',
          jobTitle: 'Product Designer',
          submittedAt: mins(300),
          completedAt: mins(280),
          timeTakenSeconds: 4000,
          transcriptionStatus: 'COMPLETED',
          evaluationStatus: 'COMPLETED',
          scores: {
            overallScore: 41,
            overallMaxScore: 50,
            overallPercentage: 82,
          },
          recommendation: 'RECOMMENDED',
          evaluatedAt: mins(280),
        }),
      ],
    };
  }
}
