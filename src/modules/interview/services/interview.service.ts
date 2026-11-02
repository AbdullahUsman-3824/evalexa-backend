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
                  deliveryStatus: true,
                },
              },
            },
          }));

        return {
          id: application.id,
          interviewId: interview.id,
          candidateName: application.candidate.fullName,
          candidateEmail: application.candidate.email,
          jobTitle: application.job.title,
          invitationDeliveryStatus:
            interview.invitation?.deliveryStatus ?? null,
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
          },
        },
      },
    });

    // Return 404 so the interview ID is not enumerable across companies.
    if (!interview || interview.application.companyId !== companyId) {
      throw new NotFoundException('Interview not found');
    }

    if (interview.application.status !== ApplicationStatus.INTERVIEW) {
      throw new BadRequestException(
        'Invitations can only be sent for applications in INTERVIEW status',
      );
    }

    // Rule: once invitation is sent, cannot resend until it expires.
    // (OTP can be resent separately; invitation itself cannot.)
    const existing = interview.invitation;
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'An invitation has already been sent and is still valid. Wait until it expires before sending again.',
      );
    }

    const email = interview.application.candidate.email;
    if (!email) {
      throw new BadRequestException('Candidate does not have an email address');
    }

    const rawToken = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const baseUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : 'http://localhost:3000';
    const interviewLink = `${baseUrl}/interviews/${interview.id}?token=${rawToken}`;

    // Only create/update when no valid invitation exists (expired or never sent)
    await this.db.interviewInvitation.upsert({
      where: { interviewId: interview.id },
      create: {
        interviewId: interview.id,
        tokenHash,
        expiresAt,
        deliveryStatus: InvitationDeliveryStatus.PENDING,
      },
      update: {
        tokenHash,
        expiresAt,
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
      message: 'Interview invitation sent to candidate.',
      data: invitation,
    };
  }
}
