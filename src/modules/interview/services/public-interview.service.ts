import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ApplicationStatus,
  ExtensionRequestStatus,
  InterviewStatus,
  InterviewQuestionStatus,
  InterviewQuestionCategory,
  InvitationDeliveryStatus,
  RecordingType,
  RecordingUploadStatus,
} from '@prisma/client';
import type { SubmitInterviewAnswerDto } from '../dto/submit-interview-answer.dto';
import { hash, compare } from 'bcrypt';
import {
  createHash,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { SupabaseService } from '../../../database/supabase.service';
import { MailService } from '../../auth/mail.service';
import { InterviewService } from './interview.service';
import { QuestionGenerationProducer } from '../../processing/producers/question-generation.producer';
import { QuestionResponse } from '../interview.interface';

@Injectable()
export class PublicInterviewService {
  private readonly logger = new Logger(PublicInterviewService.name);

  private readonly otpTtlMs = 10 * 60 * 1000;

  /** Minimum gap between OTP requests: 60 seconds */
  private readonly otpCooldownMs = 60 * 1000;

  /** Session JWT duration */
  readonly sessionTtlSeconds = 3600;

  constructor(
    private readonly db: DatabaseService,
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly interviewService: InterviewService,
    private readonly questionGenerationProducer: QuestionGenerationProducer,
  ) {}

  async requestInvitationExtension(
    interviewId: string,
    rawToken: string,
    reason: string,
  ) {
    const invitation = await this.findInvitationForExtensionRequest(
      interviewId,
      rawToken,
    );

    if (
      invitation.interview.status !== InterviewStatus.PENDING &&
      invitation.interview.status !== InterviewStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'This interview is no longer eligible for a new invitation',
      );
    }

    const request = await this.db.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${interviewId}))`;

      const pendingRequest =
        await transaction.interviewExtensionRequest.findFirst({
          where: {
            interviewId,
            status: ExtensionRequestStatus.PENDING,
          },
          select: { id: true },
        });

      if (pendingRequest) {
        throw new BadRequestException(
          'A pending invitation extension request already exists',
        );
      }

      return transaction.interviewExtensionRequest.create({
        data: {
          interviewId,
          reason,
          status: ExtensionRequestStatus.PENDING,
        },
        select: {
          id: true,
          interviewId: true,
          status: true,
          reason: true,
          requestedAt: true,
        },
      });
    });

    return { success: true, data: request };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /public/interviews/:id/preview?token=<token>
  // ─────────────────────────────────────────────────────────────────────────

  // GET /public/interviews/:id/preview?token=<token>
  async previewInterview(interviewId: string, rawToken: string) {
    const invitation = await this.findInvitationForPreview(
      interviewId,
      rawToken,
    );

    // Token is valid but invitation has expired → return structured response
    // so the frontend can redirect the candidate to request a new invitation
    if (invitation.deliveryStatus === InvitationDeliveryStatus.EXPIRED) {
      return {
        success: false,
        code: 'INVITATION_EXPIRED',
        message:
          'This invitation has expired. Please request a new invitation from the recruiter.',
        data: {
          interviewId: invitation.interview.id,
          expired: true,
          canRequestNew: true,
          jobTitle: invitation.interview.application.job.title,
          companyName: invitation.interview.application.company.name,
        },
      };
    }

    // Normal successful preview
    const alreadyVerified = invitation.verifiedAt !== null;

    return {
      success: true,
      data: {
        interviewId: invitation.interview.id,
        invitationId: invitation.id,
        jobTitle: invitation.interview.application.job.title,
        companyName: invitation.interview.application.company.name,
        language: invitation.interview.language,
        status: invitation.interview.status,
        expiresAt: invitation.expiresAt.toISOString(),
        candidateName: invitation.interview.application.candidate.fullName,
        requiresOtp: !alreadyVerified,
        alreadyVerified,
        canResume:
          invitation.interview.status === InterviewStatus.IN_PROGRESS &&
          alreadyVerified,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /public/interviews/:id/request-otp
  // ─────────────────────────────────────────────────────────────────────────

  async requestOtp(interviewId: string, rawToken: string) {
    const invitation = await this.findValidInvitation(interviewId, rawToken);
    const now = Date.now();

    // Cooldown check uses otpSentAt: this is the timestamp of the
    // last OTP send, NOT sentAt which tracks invitation email delivery.
    if (
      invitation.otpSentAt !== null &&
      now - invitation.otpSentAt.getTime() < this.otpCooldownMs
    ) {
      const waitSeconds = Math.ceil(
        (this.otpCooldownMs - (now - invitation.otpSentAt.getTime())) / 1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSeconds} seconds before requesting a new OTP`,
      );
    }

    // Use the candidate's registered email — never accept caller-supplied email.
    const email = invitation.interview.application.candidate.email;
    if (!email) {
      throw new BadRequestException('Candidate does not have an email address');
    }

    const otp = this.generateOtp();
    const otpExpiresAt = new Date(now + this.otpTtlMs);
    await this.db.interviewInvitation.update({
      where: { id: invitation.id },
      data: {
        otpHash: await hash(otp, 10),
        otpExpiresAt,
        otpAttempts: 0,
        otpSentAt: new Date(now), // Fixed: was incorrectly setting `sentAt`
      },
    });

    try {
      await this.mailService.sendInterviewOtp(email, otp);
    } catch (error: unknown) {
      // Roll back OTP state so the candidate is not left with an undelivered OTP.
      await this.db.interviewInvitation.update({
        where: { id: invitation.id },
        data: {
          otpHash: null,
          otpExpiresAt: null,
          otpSentAt: null,
          otpAttempts: 0,
        },
      });
      this.logger.error(
        `Failed to send OTP for invitation ${invitation.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }

    return {
      success: true,
      message: 'OTP sent to your email',
      data: {
        emailHint: this.maskEmail(email),
        expiresInSeconds: this.otpTtlMs / 1000,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /public/interviews/:id/verify-otp
  // ─────────────────────────────────────────────────────────────────────────

  async verifyOtp(interviewId: string, rawToken: string, otp: string) {
    const invitation = await this.findValidInvitation(interviewId, rawToken);

    if (!invitation.otpHash || !invitation.otpExpiresAt) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }
    if (invitation.otpExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }
    if (invitation.otpAttempts >= 5) {
      throw new BadRequestException(
        'Maximum OTP attempts reached. Please request a new one.',
      );
    }

    const otpCorrect = await compare(otp, invitation.otpHash);

    if (!otpCorrect) {
      // Increment attempt counter; if this takes it to 5, also clear the OTP
      // so subsequent requests get a clean "No OTP found" message.
      const newAttempts = invitation.otpAttempts + 1;
      await this.db.interviewInvitation.update({
        where: { id: invitation.id },
        data:
          newAttempts >= 5
            ? {
                otpAttempts: newAttempts,
                otpHash: null,
                otpExpiresAt: null,
              }
            : { otpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid OTP');
    }

    const verifiedAt = new Date();
    await this.db.interviewInvitation.update({
      where: { id: invitation.id },
      data: {
        verifiedAt,
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
    });

    const sessionToken = await this.jwtService.signAsync(
      {
        sub: interviewId,
        type: 'interview_session',
      },
      { expiresIn: `${this.sessionTtlSeconds}s` },
    );

    try {
      await this.questionGenerationProducer.enqueueQuestionGeneration(
        interviewId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue question generation for interview ${interviewId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      // Do not fail the OTP response — questions can be retried later
    }

    return {
      success: true,
      message: 'OTP verified successfully',
      sessionToken,
      data: {
        expiresIn: this.sessionTtlSeconds,
        interview: {
          id: invitation.interview.id,
          status: invitation.interview.status,
          startedAt: invitation.interview.startedAt,
          language: invitation.interview.language,
          jobTitle: invitation.interview.application.job.title,
          companyName: invitation.interview.application.company.name,
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /interviews/:id/start
  // ─────────────────────────────────────────────────────────────────────────

  async startInterview(
    interviewId: string,
    sessionInterviewId: string,
  ): Promise<QuestionResponse> {
    // Verify the session belongs to THIS interview
    if (sessionInterviewId !== interviewId) {
      throw new UnauthorizedException('Session does not match this interview');
    }

    return this.db.$transaction(async (tx) => {
      await this.lockInterview(tx, interviewId);
      const interview = await tx.interview.findUnique({
        where: { id: interviewId },
        select: { id: true, status: true },
      });

      if (!interview) throw new NotFoundException('Interview not found');
      if (
        interview.status !== InterviewStatus.PENDING &&
        interview.status !== InterviewStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          `Interview is no longer available (status: ${interview.status})`,
        );
      }

      const questions = await tx.interviewQuestion.findMany({
        where: { interviewId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          category: true,
          questionText: true,
          status: true,
        },
      });
      if (questions.length === 0) {
        throw new BadRequestException('Interview has no questions');
      }

      if (interview.status === InterviewStatus.PENDING) {
        const first = questions[0];
        const now = new Date();
        await tx.interview.update({
          where: { id: interviewId },
          data: { status: InterviewStatus.IN_PROGRESS, startedAt: now },
        });
        await tx.interviewQuestion.update({
          where: { id: first.id },
          data: { status: InterviewQuestionStatus.IN_PROGRESS, startedAt: now },
        });
        return this.questionResponse(interviewId, first);
      }

      const current = questions.find(
        ({ status }) => status === InterviewQuestionStatus.IN_PROGRESS,
      );
      if (!current) {
        throw new BadRequestException('Interview progression is invalid');
      }
      return this.questionResponse(interviewId, current);
    });
  }

  async getNextQuestion(
    interviewId: string,
    sessionInterviewId: string,
  ): Promise<QuestionResponse> {
    this.assertSession(interviewId, sessionInterviewId);
    return this.db.$transaction(async (tx) => {
      await this.lockInterview(tx, interviewId);
      const interview = await tx.interview.findUnique({
        where: { id: interviewId },
        select: { id: true, status: true },
      });
      if (!interview) throw new NotFoundException('Interview not found');
      if (interview.status === InterviewStatus.COMPLETED) {
        return this.questionResponse(interviewId, null, true);
      }
      if (interview.status !== InterviewStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `Interview is not available (status: ${interview.status})`,
        );
      }

      const questions = await tx.interviewQuestion.findMany({
        where: { interviewId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          category: true,
          questionText: true,
          status: true,
          sentAt: true,
        },
      });
      const currentIndex = questions.findIndex(
        ({ status }) => status === InterviewQuestionStatus.IN_PROGRESS,
      );
      if (currentIndex < 0) {
        throw new BadRequestException('Interview progression is invalid');
      }
      const sentQuestions = questions.filter(
        ({ status }) => status === InterviewQuestionStatus.SENT,
      );
      if (sentQuestions.length >= 2) {
        throw new ConflictException(
          'Wait for the previous question to be submitted before requesting the next question',
        );
      }
      const latestSentAt = sentQuestions.reduce<Date | null>(
        (latest, question) =>
          question.sentAt &&
          (!latest || question.sentAt.getTime() > latest.getTime())
            ? question.sentAt
            : latest,
        null,
      );
      if (latestSentAt) {
        const cooldownRemainingMs =
          5_000 - (Date.now() - latestSentAt.getTime());
        if (cooldownRemainingMs > 0) {
          throw new ConflictException(
            `Please retry in ${Math.ceil(cooldownRemainingMs / 1000)} seconds`,
          );
        }
      }
      const next = questions
        .slice(currentIndex + 1)
        .find(({ status }) => status === InterviewQuestionStatus.PENDING);
      if (!next) {
        return this.questionResponse(interviewId, null);
      }
      const updated = await tx.interviewQuestion.update({
        where: { id: next.id },
        data: { status: InterviewQuestionStatus.SENT, sentAt: new Date() },
        select: {
          id: true,
          order: true,
          category: true,
          questionText: true,
        },
      });
      return this.questionResponse(interviewId, updated);
    });
  }

  async generateRecordingUploadUrl(
    interviewId: string,
    questionId: string,
    sessionInterviewId: string,
  ) {
    this.assertSession(interviewId, sessionInterviewId);

    return this.db.$transaction(async (tx) => {
      await this.lockInterview(tx, interviewId);
      const interview = await tx.interview.findUnique({
        where: { id: interviewId },
        select: { id: true, status: true },
      });

      if (!interview) {
        throw new NotFoundException('Interview not found');
      }
      if (interview.status !== InterviewStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `Interview is not available (status: ${interview.status})`,
        );
      }

      const question = await tx.interviewQuestion.findUnique({
        where: { id: questionId },
        select: { id: true, interviewId: true, status: true },
      });
      if (!question || question.interviewId !== interviewId) {
        throw new NotFoundException('Interview question not found');
      }
      if (question.status !== InterviewQuestionStatus.IN_PROGRESS) {
        throw new ConflictException('Question is not currently in progress');
      }

      const path = `${interviewId}/${questionId}/${randomUUID()}.audio`;
      const upload = await this.supabaseService.createSignedUploadUrl(path);

      return {
        success: true,
        data: {
          uploadUrl: upload.signedUrl,
          storagePath: upload.path,
          token: upload.token,
        },
      };
    });
  }

  async submitAnswer(
    interviewId: string,
    questionId: string,
    sessionInterviewId: string,
    body: SubmitInterviewAnswerDto,
  ) {
    this.assertSession(interviewId, sessionInterviewId);
    const storageKey = body.storageKey;

    const expectedPathPrefix = `${interviewId}/${questionId}/`;

    if (
      !storageKey.startsWith(expectedPathPrefix) ||
      storageKey.slice(expectedPathPrefix.length).length === 0 ||
      storageKey.includes('..')
    ) {
      throw new BadRequestException('Recording storage key is invalid');
    }

    let exists: boolean;
    try {
      exists = await this.supabaseService.fileExists(storageKey);
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to verify uploaded recording',
      );
    }
    if (!exists) {
      throw new BadRequestException(
        `Uploaded recording was not found: ${storageKey}`,
      );
    }

    return this.db.$transaction(async (tx) => {
      await this.lockInterview(tx, interviewId);
      const question = await tx.interviewQuestion.findUnique({
        where: { id: questionId },
        select: {
          id: true,
          interviewId: true,
          order: true,
          status: true,
          answer: { select: { id: true } },
        },
      });
      if (!question || question.interviewId !== interviewId) {
        throw new NotFoundException('Interview question not found');
      }
      if (question.answer) {
        return {
          success: true,
          data: { interviewId, questionId, submitted: true },
        };
      }
      if (question.status !== InterviewQuestionStatus.IN_PROGRESS) {
        throw new ConflictException('Question is not currently in progress');
      }
      const earlier = await tx.interviewQuestion.findFirst({
        where: {
          interviewId,
          order: { lt: question.order },
          status: { not: InterviewQuestionStatus.ANSWERED },
        },
        select: { id: true },
      });
      if (earlier) {
        throw new ConflictException(
          'Answers must be submitted in question order',
        );
      }
      const next = await tx.interviewQuestion.findFirst({
        where: {
          interviewId,
          order: { gt: question.order },
          status: InterviewQuestionStatus.SENT,
        },
        orderBy: { order: 'asc' },
        select: { id: true, status: true },
      });
      const pending = await tx.interviewQuestion.findFirst({
        where: {
          interviewId,
          order: { gt: question.order },
          status: InterviewQuestionStatus.PENDING,
        },
        select: { id: true },
      });
      if (!next && pending) {
        throw new ConflictException('The next question has not been issued');
      }

      const now = new Date();
      const answer = await tx.interviewAnswer.create({
        data: {
          questionId,
          durationSeconds: body.durationSeconds,
          answeredAt: now,
          recording: {
            create: {
              type: RecordingType.AUDIO,
              storageKey,
              mimeType: body.mimeType,
              sizeBytes: BigInt(body.sizeBytes),
              durationSeconds: body.durationSeconds,
              uploadStatus: RecordingUploadStatus.UPLOADED,
            },
          },
        },
        select: { id: true },
      });
      await tx.interviewQuestion.update({
        where: { id: questionId },
        data: { status: InterviewQuestionStatus.ANSWERED, answeredAt: now },
      });
      if (next) {
        await tx.interviewQuestion.update({
          where: { id: next.id },
          data: { status: InterviewQuestionStatus.IN_PROGRESS, startedAt: now },
        });
      } else if (!pending) {
        await tx.interview.update({
          where: { id: interviewId },
          data: {
            status: InterviewStatus.COMPLETED,
            submittedAt: now,
            completedAt: now,
          },
        });
      }
      return {
        success: true,
        data: {
          interviewId,
          questionId,
          answerId: answer.id,
          submitted: true,
          isCompleted: !next && !pending,
        },
      };
    });
  }

  private assertSession(interviewId: string, sessionInterviewId: string): void {
    if (sessionInterviewId !== interviewId) {
      throw new UnauthorizedException('Session does not match this interview');
    }
  }

  private async lockInterview(
    transaction: Parameters<Parameters<DatabaseService['$transaction']>[0]>[0],
    interviewId: string,
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${interviewId}))`;
  }

  private questionResponse(
    interviewId: string,
    question: {
      id: string;
      order: number;
      category: InterviewQuestionCategory;
      questionText: string;
    } | null,
    isCompleted = false,
  ): QuestionResponse {
    return {
      success: true,
      data: {
        interviewId,
        question: question
          ? {
              id: question.id,
              order: question.order,
              category: question.category,
              questionText: question.questionText,
            }
          : null,
        isCompleted,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    return `${localPart.charAt(0)}***@${domain}`;
  }

  /**
   * Looks up an InterviewInvitation by interviewId, validates the raw token
   * with timing-safe comparison, checks expiry and delivery status.
   *
   * Throws on invalid token, expired invitation, or unavailable invitation.
   * Does NOT check or modify OTP state — safe to call from preview as well,
   * but prefer findInvitationForPreview for the preview route.
   */
  async findValidInvitation(interviewId: string, rawToken: string) {
    const invitation = await this.db.interviewInvitation.findUnique({
      where: { interviewId },
      select: {
        id: true,
        tokenHash: true,
        otpHash: true,
        otpExpiresAt: true,
        otpAttempts: true,
        otpSentAt: true,
        verifiedAt: true,
        expiresAt: true,
        sentAt: true,
        deliveryStatus: true,
        interview: {
          select: {
            id: true,
            language: true,
            status: true,
            startedAt: true,
            application: {
              select: {
                candidate: { select: { fullName: true, email: true } },
                company: { select: { name: true } },
                job: { select: { title: true } },
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      // Generic message to avoid confirming whether an interview ID exists
      throw new NotFoundException('Invitation not found');
    }

    // Timing-safe token comparison
    const providedHash = Buffer.from(this.hashToken(rawToken), 'utf8');
    const storedHash = Buffer.from(invitation.tokenHash, 'utf8');
    const tokenValid =
      providedHash.length === storedHash.length &&
      timingSafeEqual(providedHash, storedHash);

    if (!tokenValid) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    // Update status to EXPIRED if the invitation has passed its expiry time
    const deliveryStatus =
      await this.interviewService.updateInvitationStatusIfExpired(invitation);

    if (deliveryStatus === InvitationDeliveryStatus.EXPIRED) {
      throw new BadRequestException('Invitation has expired');
    }

    if (invitation.deliveryStatus !== InvitationDeliveryStatus.SENT) {
      throw new BadRequestException('Invitation is not available');
    }

    if (
      invitation.interview.status !== InterviewStatus.PENDING &&
      invitation.interview.status !== InterviewStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Interview is no longer available (status: ${invitation.interview.status})`,
      );
    }

    return invitation;
  }
  /**
   * Used exclusively by the preview endpoint.
   * Returns the invitation even when it is expired (after updating the status).
   * Still rejects invalid tokens and non-existent invitations.
   */
  private async findInvitationForPreview(
    interviewId: string,
    rawToken: string,
  ) {
    const invitation = await this.db.interviewInvitation.findUnique({
      where: { interviewId },
      select: {
        id: true,
        tokenHash: true,
        verifiedAt: true,
        expiresAt: true,
        deliveryStatus: true,
        interview: {
          select: {
            id: true,
            language: true,
            status: true,
            startedAt: true,
            application: {
              select: {
                candidate: { select: { fullName: true } },
                company: { select: { name: true } },
                job: { select: { title: true } },
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Timing-safe token comparison
    const providedHash = Buffer.from(this.hashToken(rawToken), 'utf8');
    const storedHash = Buffer.from(invitation.tokenHash, 'utf8');
    const tokenValid =
      providedHash.length === storedHash.length &&
      timingSafeEqual(providedHash, storedHash);

    if (!tokenValid) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    // Update status if expired and return the (possibly updated) status
    const deliveryStatus =
      await this.interviewService.updateInvitationStatusIfExpired(invitation);

    return {
      ...invitation,
      deliveryStatus,
    };
  }

  private async findInvitationForExtensionRequest(
    interviewId: string,
    rawToken: string,
  ) {
    const invitation = await this.db.interviewInvitation.findUnique({
      where: { interviewId },
      select: {
        id: true,
        tokenHash: true,
        expiresAt: true,
        sentAt: true,
        deliveryStatus: true,
        interview: {
          select: {
            id: true,
            status: true,
            application: {
              select: { status: true },
            },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const providedHash = Buffer.from(this.hashToken(rawToken), 'utf8');
    const storedHash = Buffer.from(invitation.tokenHash, 'utf8');
    const tokenValid =
      providedHash.length === storedHash.length &&
      timingSafeEqual(providedHash, storedHash);

    if (!tokenValid) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    const deliveryStatus =
      await this.interviewService.updateInvitationStatusIfExpired(invitation);

    if (
      !invitation.sentAt ||
      deliveryStatus !== InvitationDeliveryStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Only expired invitations that were sent can be extended',
      );
    }

    if (
      invitation.interview.application.status !== ApplicationStatus.INTERVIEW
    ) {
      throw new BadRequestException(
        'This interview is no longer eligible for a new invitation',
      );
    }

    return { ...invitation, deliveryStatus };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
