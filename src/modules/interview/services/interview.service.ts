import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationStatus, InvitationDeliveryStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service';
import { MailService } from '../../auth/mail.service';

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
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
  // POST /interviews/:id/invitations/send
  // ─────────────────────────────────────────────────────────────────────────────

  async sendInvitation(companyId: string, interviewId: string) {
    const interview = await this.db.interview.findUnique({
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

    // Normalize existing invitation status (marks it EXPIRED if needed)
    const existing = interview.invitation
      ? {
          ...interview.invitation,
          deliveryStatus: await this.updateInvitationStatusIfExpired(
            interview.invitation,
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
    await this.db.interviewInvitation.upsert({
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
      await this.db.interviewInvitation.update({
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
    const invitation = await this.db.interviewInvitation.update({
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

  async updateInvitationStatusIfExpired(invitation: {
    id: string;
    expiresAt: Date;
    deliveryStatus: InvitationDeliveryStatus;
  }) {
    if (
      invitation.deliveryStatus === InvitationDeliveryStatus.EXPIRED ||
      invitation.expiresAt.getTime() > Date.now()
    ) {
      return invitation.deliveryStatus;
    }

    await this.db.interviewInvitation.update({
      where: { id: invitation.id },
      data: { deliveryStatus: InvitationDeliveryStatus.EXPIRED },
    });

    return InvitationDeliveryStatus.EXPIRED;
  }
}
