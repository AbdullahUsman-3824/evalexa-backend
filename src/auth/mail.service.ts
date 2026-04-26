import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly mailFrom: string;
  private readonly transporter: nodemailer.Transporter;
  private readonly smtpHost: string;
  private readonly smtpUser: string;
  private readonly smtpPass: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();

    this.smtpHost = host ?? '';
    this.smtpUser = user ?? '';
    this.smtpPass = pass ?? '';
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    this.mailFrom =
      this.configService.get<string>('SMTP_FROM') ??
      user ??
      'no-reply@example.com';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  private ensureSmtpConfiguration(): boolean {
    const missing: string[] = [];

    if (!this.smtpHost) {
      missing.push('SMTP_HOST');
    }
    if (!this.smtpUser) {
      missing.push('SMTP_USER');
    }
    if (!this.smtpPass) {
      missing.push('SMTP_PASS');
    }

    if (missing.length > 0) {
      if (!this.isProduction) {
        this.logger.warn(
          `SMTP is not configured (${missing.join(', ')}). OTP emails will be logged in development mode.`,
        );
        return false;
      }

      throw new ServiceUnavailableException(
        `Email service is not configured. Missing: ${missing.join(', ')}`,
      );
    }

    return true;
  }

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    const canSendEmail = this.ensureSmtpConfiguration();

    if (!canSendEmail) {
      this.logger.log(`DEV verification OTP for ${email}: ${otp}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject: 'Verify your email - Evalexa',
        text: `Your Evalexa verification code is ${otp}. It will expire in 10 minutes.`,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';

      this.logger.error(
        `Failed to send verification email to ${email}: ${message}`,
      );

      throw new InternalServerErrorException(
        `Failed to send verification email: ${message}`,
      );
    }
  }

  async sendPasswordResetOtp(email: string, otp: string): Promise<void> {
    const canSendEmail = this.ensureSmtpConfiguration();

    if (!canSendEmail) {
      this.logger.log(`DEV password reset OTP for ${email}: ${otp}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject: 'Reset your password - Evalexa',
        text: `Your Evalexa password reset code is ${otp}. It will expire in 10 minutes.`,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';

      this.logger.error(
        `Failed to send reset OTP email to ${email}: ${message}`,
      );

      throw new InternalServerErrorException(
        `Failed to send password reset email: ${message}`,
      );
    }
  }
}
