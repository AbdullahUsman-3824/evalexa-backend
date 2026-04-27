import {
  BadRequestException,
  NotFoundException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { randomInt } from 'crypto';
import { DatabaseService } from '../database/database.service';
import type { RegisterDto } from './dto/register.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { MailService } from './mail.service';

type LoginUserResponse = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  companyId: number | null;
  isVerified: boolean;
  isActive: boolean;
};

type LoginResponse = {
  access_token: string;
  user: LoginUserResponse;
};

@Injectable()
export class AuthService {
  private readonly otpTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  private generateOtp(): string {
    return randomInt(0, 1000000).toString().padStart(6, '0');
  }

  private async storeUserOtp(
    pendingUserRegistrationId: number,
    otp: string,
  ): Promise<Date> {
    const expiresAt = new Date(Date.now() + this.otpTtlMs);
    const otpHash = await hash(otp, 10);

    await this.db.emailVerificationOtp.upsert({
      where: { pendingUserRegistrationId },
      create: {
        pendingUserRegistrationId,
        otpHash,
        expiresAt,
      },
      update: {
        otpHash,
        expiresAt,
      },
    });

    return expiresAt;
  }

  async initiateRegister(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const existingUser = await this.db.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    const pendingRegistration = await this.db.pendingUserRegistration.upsert({
      where: { email },
      create: {
        fullName: registerDto.fullName,
        email,
        passwordHash: await hash(registerDto.password, 10),
        phone: registerDto.phone,
        role: registerDto.role ?? 'recruiter',
      },
      update: {
        fullName: registerDto.fullName,
        passwordHash: await hash(registerDto.password, 10),
        phone: registerDto.phone,
        role: registerDto.role ?? 'recruiter',
      },
    });
    const otp = this.generateOtp();

    await this.storeUserOtp(pendingRegistration.id, otp);
    await this.mailService.sendVerificationOtp(pendingRegistration.email, otp);

    return {
      message: 'Registration successful. OTP sent to email.',
    };
  }

  async register(registerDto: RegisterDto) {
    return this.initiateRegister(registerDto);
  }

  async verifyEmail(email: string, otp: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const pendingRegistration =
      await this.db.pendingUserRegistration.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          fullName: true,
          email: true,
          passwordHash: true,
          phone: true,
          role: true,
          emailVerificationOtp: {
            select: {
              otpHash: true,
              expiresAt: true,
            },
          },
        },
      });

    if (!pendingRegistration) {
      throw new NotFoundException(
        'No pending registration found for this email',
      );
    }

    if (!pendingRegistration.emailVerificationOtp) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    if (
      pendingRegistration.emailVerificationOtp.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    const isOtpValid = await compare(
      otp,
      pendingRegistration.emailVerificationOtp.otpHash,
    );

    if (!isOtpValid) {
      throw new BadRequestException('Invalid OTP');
    }

    const user = await this.db.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          fullName: pendingRegistration.fullName,
          email: pendingRegistration.email,
          password: pendingRegistration.passwordHash,
          phone: pendingRegistration.phone,
          role: pendingRegistration.role,
          companyId: null,
          isVerified: true,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          companyId: true,
          isVerified: true,
          isActive: true,
        },
      });

      await transaction.pendingUserRegistration.delete({
        where: { id: pendingRegistration.id },
      });

      return createdUser;
    });

    return {
      message: 'Email verified successfully. Account created.',
      user,
    };
  }

  async resendOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const pendingRegistration =
      await this.db.pendingUserRegistration.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
        },
      });

    if (!pendingRegistration) {
      throw new NotFoundException(
        'No pending registration found for this email',
      );
    }

    const otp = this.generateOtp();
    await this.storeUserOtp(pendingRegistration.id, otp);
    await this.mailService.sendVerificationOtp(pendingRegistration.email, otp);

    return { message: 'OTP resent successfully' };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    if (!user.isVerified) {
      throw new BadRequestException('Email is not verified');
    }

    const otp = this.generateOtp();
    const otpHash = await hash(otp, 10);
    const expiresAt = new Date(Date.now() + this.otpTtlMs);

    await this.db.passwordResetOtp.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        otpHash,
        expiresAt,
      },
      update: {
        otpHash,
        expiresAt,
      },
    });

    await this.mailService.sendPasswordResetOtp(user.email, otp);

    return { message: 'OTP sent to your email' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        passwordResetOtp: {
          select: {
            otpHash: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    if (!user.passwordResetOtp) {
      throw new BadRequestException('No password reset OTP found');
    }

    if (user.passwordResetOtp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    const isOtpValid = await compare(otp, user.passwordResetOtp.otpHash);

    if (!isOtpValid) {
      throw new BadRequestException('Invalid OTP');
    }

    const passwordHash = await hash(newPassword, 10);

    await this.db.$transaction([
      this.db.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
        },
      }),
      this.db.passwordResetOtp.delete({
        where: { userId: user.id },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Email is not verified');
    }

    const { password: hashedPassword, ...sanitizedUser } = user;

    const isPasswordValid = await compare(password, hashedPassword);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return sanitizedUser;
  }

  async login(user: AuthenticatedUser): Promise<LoginResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        isVerified: user.isVerified,
        isActive: user.isActive,
      },
    };
  }
}
