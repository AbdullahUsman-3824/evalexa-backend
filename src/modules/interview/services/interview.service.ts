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
}
