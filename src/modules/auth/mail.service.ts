import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const BRAND = {
  bgPage: '#0B1120',
  bgCard: '#0F172A',
  bgNavy: '#1E293B',
  primary: '#60A5FA',
  cyan: '#06B6D4',
  white: '#FFFFFF',
  textMuted: '#94A3B8',
  border: '#334155',
  success: '#16A34A',
  warning: '#F59E0B',
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly mailFrom: string;
  private readonly transporter: nodemailer.Transporter;
  private readonly smtpHost: string;
  private readonly smtpUser: string;
  private readonly smtpPass: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();

    this.smtpHost = host ?? '';
    this.smtpUser = user ?? '';
    this.smtpPass = pass ?? '';

    this.mailFrom =
      this.configService.get<string>('SMTP_FROM') ??
      user ??
      'no-reply@evalexa.com';

    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      'https://evalexa-frontend.vercel.app';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  private ensureSmtpConfiguration(): void {
    const missing: string[] = [];
    if (!this.smtpHost) missing.push('SMTP_HOST');
    if (!this.smtpUser) missing.push('SMTP_USER');
    if (!this.smtpPass) missing.push('SMTP_PASS');

    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `Email service is not configured. Missing: ${missing.join(', ')}`,
      );
    }
  }

  private buildHtmlEmail({
    title,
    preheader,
    bodyContent,
    ctaText,
    ctaLink,
    companyName,
    companyLogo,
  }: {
    title: string;
    preheader: string;
    bodyContent: string;
    ctaText?: string;
    ctaLink?: string;
    companyName?: string;
    companyLogo?: string;
  }): string {
    const logoBlock = companyLogo
      ? `<img src="${companyLogo}" alt="${companyName ?? 'Evalexa'}" width="40" height="40"
            style="display:block;margin:0 auto;width:40px;height:40px;border-radius:10px;object-fit:cover;" />`
      : `<span style="font-family:'Syne',system-ui,sans-serif;font-size:24px;
               font-weight:800;color:${BRAND.white};letter-spacing:-0.5px;line-height:1;">
           Eval<span style="color:${BRAND.cyan};">exa</span>
         </span>`;

    const ctaHtml =
      ctaText && ctaLink
        ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px auto 16px;">
             <tr>
               <td align="center" style="background-color:${BRAND.primary};border-radius:8px;">
                 <a href="${ctaLink}" target="_blank"
                    style="display:inline-block;padding:14px 36px;
                           font-family:'DM Sans',system-ui,sans-serif;
                           font-size:15px;font-weight:700;color:${BRAND.bgCard};
                           text-decoration:none;border-radius:8px;">
                   ${ctaText}
                 </a>
               </td>
             </tr>
           </table>`
        : '';

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    a { color:${BRAND.cyan}; text-decoration:none; }
    
    @media screen and (max-width:600px) {
      .container { width:100% !important; }
      .px-mobile { padding-left:24px !important; padding-right:24px !important; }
      .h1-mobile { font-size:28px !important; }
      .otp-digits { font-size:32px !important; letter-spacing:8px !important; padding-left:8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgPage};font-family:'DM Sans',system-ui,-apple-system,sans-serif;color:${BRAND.textMuted};line-height:1.6;">

  <div style="display:none;font-size:1px;color:${BRAND.bgPage};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.bgPage};">
    <tr>
      <td align="center" style="padding:48px 16px;">
        
        <!-- MAIN CONTAINER (Added align="center" and margin:0 auto) -->
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="600" align="center"
               style="max-width:600px;width:100%;margin:0 auto;background-color:${BRAND.bgCard};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 20px 40px rgba(0,0,0,0.4);">
          
          <tr>
            <td class="px-mobile" style="padding:40px 40px 24px;text-align:center;">
              <div style="margin-bottom:16px;text-align:center;">${logoBlock}</div>
              ${companyName ? `<div style="font-size:12px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:2px;font-weight:600;text-align:center;">via ${companyName}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding:0 40px 40px;">
              <h1 class="h1-mobile"
                  style="margin:0 0 24px;font-family:'Syne',system-ui,sans-serif;
                         font-size:36px;font-weight:700;color:${BRAND.white};
                         line-height:1.1;letter-spacing:-1px;text-align:center;">
                ${title}
              </h1>
              
              <div style="font-size:16px;color:${BRAND.textMuted};text-align:center;">
                ${bodyContent}
              </div>
              
              <div style="text-align:center;">
                ${ctaHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding:24px 40px;background-color:${BRAND.bgNavy};border-top:1px solid ${BRAND.border};text-align:center;">
              <p style="margin:0;font-size:13px;color:${BRAND.textMuted};text-align:center;">
                Powered by <a href="${this.frontendUrl}" style="color:${BRAND.cyan};font-weight:600;">Evalexa</a>
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#64748B;text-align:center;">
                AI-Powered Recruitment Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    this.ensureSmtpConfiguration();

    const html = this.buildHtmlEmail({
      title: 'Verify your email',
      preheader: `Your Evalexa verification code is ${otp}.`,
      bodyContent: `
        <p style="margin:0 0 32px;text-align:center;">Welcome to Evalexa. Enter the code below to confirm your email address.</p>
        <div style="background-color:${BRAND.bgNavy};border-radius:12px;padding:32px 16px;margin:0 0 32px;text-align:center;">
          <div class="otp-digits"
               style="font-family:'Syne',system-ui,sans-serif;font-size:40px;font-weight:700;
                      color:${BRAND.white};letter-spacing:16px;line-height:1;padding-left:16px;text-align:center;">
            ${otp}
          </div>
          <div style="font-size:12px;color:${BRAND.warning};margin-top:16px;font-weight:600;letter-spacing:0.5px;text-align:center;">
            Expires in 10 minutes
          </div>
        </div>
        <p style="margin:0;font-size:14px;text-align:center;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `,
    });

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject: 'Verify your email – Evalexa',
        html,
        text: `Your Evalexa verification code is ${otp}. It expires in 10 minutes.`,
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
    this.ensureSmtpConfiguration();

    const html = this.buildHtmlEmail({
      title: 'Reset your password',
      preheader: `Your Evalexa password reset code is ${otp}.`,
      bodyContent: `
        <p style="margin:0 0 32px;text-align:center;">We received a request to reset your Evalexa password. Use the code below to proceed.</p>
        <div style="background-color:${BRAND.bgNavy};border-radius:12px;padding:32px 16px;margin:0 0 32px;text-align:center;">
          <div class="otp-digits"
               style="font-family:'Syne',system-ui,sans-serif;font-size:40px;font-weight:700;
                      color:${BRAND.white};letter-spacing:16px;line-height:1;padding-left:16px;text-align:center;">
            ${otp}
          </div>
          <div style="font-size:12px;color:${BRAND.warning};margin-top:16px;font-weight:600;letter-spacing:0.5px;text-align:center;">
            Expires in 10 minutes
          </div>
        </div>
        <p style="margin:0;font-size:14px;text-align:center;">
          If you didn't request a password reset, please ignore this email.
        </p>
      `,
    });

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject: 'Reset your password – Evalexa',
        html,
        text: `Your Evalexa password reset code is ${otp}. It expires in 10 minutes.`,
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

  async sendInterviewInvitation(
    email: string,
    interviewLink: string,
    expiresAt: Date,
    companyName: string,
    jobTitle: string,
    companyLogo?: string,
    jobLocation?: string,
    salaryRange?: string,
  ): Promise<void> {
    this.ensureSmtpConfiguration();

    const expiryFormatted = expiresAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Fixed: Removed display:flex, used standard inline elements
    const metaBits: string[] = [];
    if (jobLocation) metaBits.push(`${jobLocation}`);
    if (salaryRange) metaBits.push(`${salaryRange}`);
    const metaHtml = metaBits.length
      ? `<div style="margin-top:12px;font-size:14px;color:${BRAND.textMuted};text-align:center;">
           ${metaBits.join(' &nbsp;&nbsp;·&nbsp;&nbsp; ')}
         </div>`
      : '';

    const html = this.buildHtmlEmail({
      title: 'Interview Invitation',
      preheader: `You're invited to interview for ${jobTitle} at ${companyName}.`,
      companyName,
      companyLogo,
      bodyContent: `
        <p style="margin:0 0 24px;font-size:18px;color:${BRAND.white};text-align:center;">
          Congratulations! You have been selected to interview for:
        </p>
        
        <!-- Job Box: Ensured text-align center applies to inner elements -->
        <div style="background-color:${BRAND.bgNavy};border-radius:12px;padding:24px;margin:0 0 32px;text-align:center;">
          <div style="font-size:12px;color:${BRAND.cyan};font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;text-align:center;">
            ${companyName}
          </div>
          <div style="font-family:'Syne',system-ui,sans-serif;font-size:24px;font-weight:700;color:${BRAND.white};line-height:1.3;text-align:center;">
            ${jobTitle}
          </div>
          ${metaHtml}
        </div>
        
        <p style="margin:0 0 8px;text-align:center;">Click below to start your interview. Valid until <strong style="color:${BRAND.white};">${expiryFormatted}</strong>.</p>
        <p style="margin:0;font-size:14px;text-align:center;">Make sure you're in a quiet environment with a stable connection.</p>
      `,
      ctaText: 'Start Interview',
      ctaLink: interviewLink,
    });

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject: `Interview Invitation: ${jobTitle} at ${companyName}`,
        html,
        text: `Interview Invitation from ${companyName}\n\nRole: ${jobTitle}\nLink: ${interviewLink}\nValid until: ${expiryFormatted}`,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(
        `Failed to send interview invitation to ${email}: ${message}`,
      );
      throw new InternalServerErrorException(
        `Failed to send interview invitation: ${message}`,
      );
    }
  }

  async sendInterviewOtp(
    email: string,
    otp: string,
    companyName?: string,
    jobTitle?: string,
    companyLogo?: string,
    jobLocation?: string,
    salaryRange?: string,
  ): Promise<void> {
    this.ensureSmtpConfiguration();

    const html = this.buildHtmlEmail({
      title: 'Interview Verification',
      preheader: `Use ${otp} to verify your identity.`,
      companyName,
      companyLogo,
      bodyContent: `
        <p style="margin:0 0 32px;text-align:center;">Enter the code below to verify your identity${jobTitle ? ` and continue with your ${jobTitle} interview` : ' and continue with your interview'}.</p>
        <div style="background-color:${BRAND.bgNavy};border-radius:12px;padding:32px 16px;margin:0 0 32px;text-align:center;">
          <div class="otp-digits"
               style="font-family:'Syne',system-ui,sans-serif;font-size:40px;font-weight:700;
                      color:${BRAND.white};letter-spacing:16px;line-height:1;padding-left:16px;text-align:center;">
            ${otp}
          </div>
          <div style="font-size:12px;color:${BRAND.warning};margin-top:16px;font-weight:600;letter-spacing:0.5px;text-align:center;">
            Expires in 10 minutes
          </div>
        </div>
        <p style="margin:0;font-size:14px;text-align:center;">For your security, never share this code with anyone.</p>
      `,
    });

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject:
          companyName && jobTitle
            ? `Interview verification code: ${jobTitle} at ${companyName}`
            : 'Your interview verification code – Evalexa',
        html,
        text: [
          companyName && jobTitle
            ? `Interview verification for ${jobTitle} at ${companyName}`
            : 'Interview verification',
          '',
          `Your verification code is ${otp}. It expires in 10 minutes.`,
          ...(jobLocation ? [`Location: ${jobLocation}`] : []),
          ...(salaryRange ? [`Salary: ${salaryRange}`] : []),
        ].join('\n'),
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(
        `Failed to send interview OTP email to ${email}: ${message}`,
      );
      throw new InternalServerErrorException(
        `Failed to send interview OTP email: ${message}`,
      );
    }
  }

  async sendHireDecisionEmail(
    email: string,
    candidateName: string,
    jobTitle: string,
    companyName: string,
    companyLogo?: string,
    salaryRange?: string,
    startDate?: string,
  ): Promise<void> {
    this.ensureSmtpConfiguration();

    const detailRows: string[] = [];
    if (salaryRange) {
      detailRows.push(`
        <tr>
          <td style="padding:12px 0;font-size:14px;color:${BRAND.textMuted};border-top:1px solid ${BRAND.border};text-align:left;">Salary</td>
          <td style="padding:12px 0;font-size:14px;color:${BRAND.white};font-weight:600;border-top:1px solid ${BRAND.border};text-align:right;">
            ${salaryRange}
          </td>
        </tr>`);
    }
    if (startDate) {
      detailRows.push(`
        <tr>
          <td style="padding:12px 0;font-size:14px;color:${BRAND.textMuted};border-top:1px solid ${BRAND.border};text-align:left;">Start date</td>
          <td style="padding:12px 0;font-size:14px;color:${BRAND.white};font-weight:600;border-top:1px solid ${BRAND.border};text-align:right;">
            ${startDate}
          </td>
        </tr>`);
    }
    const detailsHtml = detailRows.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;">
           ${detailRows.join('')}
         </table>`
      : '';

    const html = this.buildHtmlEmail({
      title: 'You have been selected! 🎉',
      preheader: `Congratulations ${candidateName}, you have been selected for the next stage.`,
      companyName,
      companyLogo,
      bodyContent: `
        <p style="margin:0 0 24px;font-size:18px;color:${BRAND.white};text-align:center;">
          Congratulations, <strong>${candidateName}</strong>!
        </p>
        <p style="margin:0 0 24px;text-align:center;">
          We are pleased to inform you that you have been selected for the next stage of our recruitment process. Our recruitment team will contact you shortly regarding the next steps.
        </p>

        <!-- Job Details Box (Left Aligned by design for data readability) -->
        <div style="background-color:${BRAND.bgNavy};border-radius:12px;padding:24px;margin:0 0 32px;text-align:left;">
          <div style="font-size:12px;color:${BRAND.success};font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;text-align:left;">
            ${companyName}
          </div>
          <div style="font-family:'Syne',system-ui,sans-serif;font-size:24px;font-weight:700;color:${BRAND.white};line-height:1.3;text-align:left;">
            ${jobTitle}
          </div>
          ${detailsHtml}
        </div>

        <p style="margin:0;text-align:center;">Keep an eye on your inbox for further updates from the hiring team.</p>
      `,
      ctaText: 'View Application',
      ctaLink: `${this.frontendUrl}/candidate/applications`,
    });

    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to: email,
        subject: `Next Steps: ${jobTitle} at ${companyName}`,
        html,
        text: `Congratulations ${candidateName}!\n\nWe are pleased to inform you that you have been selected for the next stage of our recruitment process. Our recruitment team will contact you shortly regarding the next steps.`,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(
        `Failed to send selection email to ${email}: ${message}`,
      );
      throw new InternalServerErrorException(
        `Failed to send selection email: ${message}`,
      );
    }
  }
}
