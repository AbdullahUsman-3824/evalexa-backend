import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InterviewStatus, InvitationDeliveryStatus } from '@prisma/client';
import { hash, compare } from 'bcrypt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { MailService } from '../../auth/mail.service';

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
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // GET /public/interviews/:id/preview?token=<token>
  // ─────────────────────────────────────────────────────────────────────────

  async previewInterview(interviewId: string, rawToken: string) {
    const invitation = await this.findValidInvitation(interviewId, rawToken);

    // alreadyVerified is scoped to THIS invitation: a resent invitation starts
    // with verifiedAt=null even if the old one was previously verified.
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
  // POST /public/interviews/:id/verify-otp  (tasks #9, #10)
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
  // POST /interviews/:id/start  (tasks #11, #12, #16)
  // ─────────────────────────────────────────────────────────────────────────

  async startInterview(interviewId: string, sessionInterviewId: string) {
    // Verify the session belongs to THIS interview
    if (sessionInterviewId !== interviewId) {
      throw new UnauthorizedException('Session does not match this interview');
    }

    const interview = await this.db.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        language: true,
        application: {
          select: {
            job: { select: { title: true } },
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    if (
      interview.status !== InterviewStatus.PENDING &&
      interview.status !== InterviewStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Interview is no longer available (status: ${interview.status})`,
      );
    }

    // Transition PENDING → IN_PROGRESS atomically
    if (interview.status === InterviewStatus.PENDING) {
      await this.db.interview.updateMany({
        where: {
          id: interviewId,
          status: InterviewStatus.PENDING,
        },
        data: {
          status: InterviewStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
    }

    const current = await this.db.interview.findUniqueOrThrow({
      where: { id: interviewId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        language: true,
        application: {
          select: {
            job: { select: { title: true } },
            company: { select: { name: true } },
          },
        },
      },
    });

    return {
      success: true,
      data: {
        interview: {
          id: current.id,
          status: current.status,
          startedAt: current.startedAt,
          language: current.language,
          jobTitle: current.application.job.title,
          companyName: current.application.company.name,
        },
      },
    };
  }

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
   * Does NOT check or modify OTP state — safe to call from preview.
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
        otpSentAt: true, // Added missing field (used by requestOtp)
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
      // Use a generic message to avoid confirming whether an interview ID exists.
      throw new NotFoundException('Invitation not found');
    }

    // Timing-safe token comparison to prevent timing attacks.
    const providedHash = Buffer.from(this.hashToken(rawToken), 'utf8');
    const storedHash = Buffer.from(invitation.tokenHash, 'utf8');
    const tokenValid =
      providedHash.length === storedHash.length &&
      timingSafeEqual(providedHash, storedHash);

    if (!tokenValid) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
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

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
