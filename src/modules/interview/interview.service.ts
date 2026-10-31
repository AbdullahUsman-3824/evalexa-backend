import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationStatus,
  InvitationDeliveryStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { MailService } from '../auth/mail.service';

@Injectable()
export class InterviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

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
          interviewId: interview.invitation?.id ?? null,
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
      },
    });

    if (!interview || interview.application.companyId !== companyId) {
      throw new BadRequestException('Interview not found');
    }

    if (interview.application.status !== ApplicationStatus.INTERVIEW) {
      throw new BadRequestException(
        'Invitations can only be sent for interview applications',
      );
    }

    const email = interview.application.candidate.email;
    if (!email) {
      throw new BadRequestException(
        'Candidate does not have an email address',
      );
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const baseUrl = (
      this.configService.get<string>('INTERVIEW_BASE_URL') ??
      'http://localhost:3000/interviews'
    ).replace(/\/$/, '');
    const interviewLink = `${baseUrl}/${interview.id}?token=${rawToken}`;

    await this.db.interviewInvitation.upsert({
      where: { interviewId: interview.id },
      create: {
        interviewId: interview.id,
        tokenHash,
        expiresAt,
      },
      update: {
        tokenHash,
        expiresAt,
        deliveryStatus: InvitationDeliveryStatus.PENDING,
        sentAt: null,
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
      message: `Interview invitation sent to ${email}.`,
      data: invitation,
    };
  }
}
