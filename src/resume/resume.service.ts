import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CandidateService } from '../candidate/candidate.service';
import { DatabaseService } from '../database/database.service';
import { SupabaseService } from '../database/supabase.service';
import {
  AutofillEducationDto,
  AutofillExperienceDto,
  AutofillPersonalDto,
  ResumeUploadResponseDto,
} from './dto/resume-upload-response.dto';
import { UploadedResumeFileDto } from './dto/uploaded-resume-file.dto';
import { ResumeParserService, ParsedResumeData } from './resume-parser.service';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ResumeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly candidateService: CandidateService,
    private readonly resumeParser: ResumeParserService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async uploadAndProcess(
    file: UploadedResumeFileDto,
    candidateId?: string,
  ): Promise<ResumeUploadResponseDto> {
    const parsed = await this.resumeParser.parseResume(
      file.buffer,
      file.originalname,
    );

    if (!parsed) {
      throw new BadRequestException('Parser returned empty result');
    }

    const candidate = await this.resolveCandidate(parsed, candidateId);

    const resumeUrl = await this.uploadToSupabase(file);

    const resume = await this.createResumeRecord({
      candidateId: candidate.id,
      resumeUrl,
      fileName: file.originalname,
      parsed,
    });

    return this.buildAutofillResponse({
      candidateId: candidate.id,
      resumeId: resume.id,
      resumeUrl,
      parsed,
    });
  }

  async findById(id: string) {
    return this.db.resume.findUnique({
      where: { id },
      select: {
        id: true,
        candidateId: true,
        resumeUrl: true,
      },
    });
  }

  async createResume(data: {
    candidateId: string;
    resumeUrl: string;
    parsedData?: object;
    extractedEducation?: string | null;
    extractedExperience?: number | null;
  }) {
    return this.db.resume.create({
      data: {
        candidateId: data.candidateId,
        resumeUrl: data.resumeUrl,
        parsedData: data.parsedData,
        extractedEducation: data.extractedEducation ?? null,
        extractedExperience: data.extractedExperience ?? null,
        isPrimary: false,
      },
      select: {
        id: true,
        candidateId: true,
      },
    });
  }

  async updateResume(
    id: string,
    data: {
      candidateId?: string;
      resumeUrl?: string;
      parsedData?: object;
      extractedEducation?: string | null;
      extractedExperience?: number | null;
    },
  ) {
    const existing = await this.findById(id);

    if (!existing) {
      throw new NotFoundException(`Resume with id ${id} not found`);
    }

    return this.db.resume.update({
      where: { id },
      data,
      select: {
        id: true,
        candidateId: true,
      },
    });
  }

  private async resolveCandidate(
    parsed: ParsedResumeData,
    candidateId?: string,
  ) {
    const basics = parsed.basics ?? ({} as ParsedResumeData['basics']);
    const fullName = this.normalizeText(basics.fullName) ?? 'Unknown';
    const email = this.normalizeEmail(basics.email);
    const phone = this.normalizeText(basics.phone);
    const linkedinUrl = this.normalizeText(basics.linkedinUrl);
    const location = this.normalizeText(basics.location);

    if (candidateId) {
      const existing = await this.candidateService.findById(candidateId);

      if (!existing) {
        throw new NotFoundException(
          `Candidate with id ${candidateId} not found`,
        );
      }

      return existing;
    }

    if (email) {
      const byEmail = await this.candidateService.findByEmail(email);

      if (byEmail) return byEmail;
    }

    return this.candidateService.createCandidate({
      fullName,
      email: email ?? undefined,
      phone: phone ?? undefined,
      linkedinUrl: linkedinUrl ?? undefined,
      location: location ?? undefined,
    });
  }

  private async uploadToSupabase(file: UploadedResumeFileDto): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'resumes';
    const storagePath = this.buildStoragePath(file.originalname);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(
        `Failed to upload resume: ${error.message}`,
      );
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  private async createResumeRecord(params: {
    candidateId: string;
    resumeUrl: string;
    fileName: string;
    parsed: ParsedResumeData;
  }) {
    const { candidateId, resumeUrl, fileName, parsed } = params;

    const extractedSkills = this.extractSkills(parsed.skills);

    const extractedExperience =
      typeof parsed.meta?.totalExperienceMonths === 'number'
        ? parsed.meta.totalExperienceMonths
        : null;

    const extractedEducation = parsed.education?.[0]?.degree ?? null;

    return this.db.resume.create({
      data: {
        candidateId,
        resumeUrl,
        fileName,
        parsedData: parsed as unknown as object,
        extractedSkills: extractedSkills as unknown as object,
        extractedExperience,
        extractedEducation,
        isPrimary: false,
      },
    });
  }

  private buildAutofillResponse(params: {
    candidateId: string;
    resumeId: string;
    resumeUrl: string;
    parsed: ParsedResumeData;
  }): ResumeUploadResponseDto {
    const { candidateId, resumeId, resumeUrl, parsed } = params;
    const basics = parsed.basics ?? ({} as ParsedResumeData['basics']);

    const fullName = this.normalizeText(basics.fullName) ?? 'Unknown';
    const { firstName, lastName } = this.splitName(fullName);

    const personal: AutofillPersonalDto = {
      firstName,
      lastName,
      email: this.normalizeEmail(basics.email),
      phone: this.normalizeText(basics.phone),
      headline:
        this.normalizeText(basics.summary) ??
        this.normalizeText(basics.headline),
      address: this.normalizeText(basics.location),
      linkedinUrl: this.normalizeText(basics.linkedinUrl),
    };

    return {
      candidateId,
      resumeId,
      resumeUrl,
      personal,
      education: this.mapEducation(parsed.education),
      experience: this.mapExperience(parsed.experience),
    };
  }

  private splitName(fullName: string): { firstName: string; lastName: string } {
    const trimmed = fullName.trim();

    if (!trimmed) {
      return { firstName: 'Unknown', lastName: '' };
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return { firstName: 'Unknown', lastName: '' };
    }

    return {
      firstName: parts[0] ?? 'Unknown',
      lastName: parts.slice(1).join(' '),
    };
  }

  private formatDate(date: string | null | undefined): string | null {
    if (!date) {
      return null;
    }

    const trimmed = date.trim();

    if (!trimmed) {
      return null;
    }

    const isoMonthMatch = trimmed.match(/^(\d{4})-(\d{2})/);

    if (isoMonthMatch) {
      return `${isoMonthMatch[2]}/${isoMonthMatch[1]}`;
    }

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);

    if (slashMatch) {
      return `${slashMatch[1].padStart(2, '0')}/${slashMatch[2]}`;
    }

    const yearMatch = trimmed.match(/^(\d{4})$/);

    if (yearMatch) {
      return `01/${yearMatch[1]}`;
    }

    return null;
  }

  private mapEducation(
    educationList: ParsedResumeData['education'],
  ): AutofillEducationDto[] {
    if (!Array.isArray(educationList)) {
      return [];
    }

    return educationList.map((education) => ({
      degree: this.normalizeText(education.degree),
      field: this.normalizeText(education.field),
      institution: this.normalizeText(education.institution),
      startDate: this.formatDate(education.startDate),
      endDate: this.formatDate(education.endDate),
      grade: this.normalizeText(education.grade),
    }));
  }

  private mapExperience(
    experienceList: ParsedResumeData['experience'],
  ): AutofillExperienceDto[] {
    if (!Array.isArray(experienceList)) {
      return [];
    }

    return experienceList.map((experience) => ({
      title: this.normalizeText(experience.title),
      company: this.normalizeText(experience.company),
      startDate: this.formatDate(experience.startDate),
      endDate: experience.endDate ? this.formatDate(experience.endDate) : null,
      isCurrent: !experience.endDate,
      description: this.normalizeText(experience.description),
    }));
  }

  private extractSkills(skills: ParsedResumeData['skills']): string[] {
    if (!Array.isArray(skills)) {
      return [];
    }

    return Array.from(
      new Set(
        skills
          .map((skill) => this.normalizeText(skill.name))
          .filter((skill): skill is string => Boolean(skill)),
      ),
    );
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeEmail(value: string | null | undefined): string | null {
    const normalized = this.normalizeText(value);
    return normalized ? normalized.toLowerCase() : null;
  }

  private buildStoragePath(fileName: string): string {
    const extension = fileName.includes('.')
      ? fileName.slice(fileName.lastIndexOf('.'))
      : '';

    return `${Date.now()}-${crypto.randomUUID()}${extension}`;
  }
}
