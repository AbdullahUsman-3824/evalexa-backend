import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { SupabaseService } from '../../database/supabase.service';
import {
  AutofillEducationDto,
  AutofillExperienceDto,
  AutofillPersonalDto,
  AutofillSkillDto,
  ResumeParsePreviewDto,
} from './dto/resume-upload-response.dto';
import { UploadedResumeFileDto } from './dto/uploaded-resume-file.dto';
import { ResumeParserService, ParsedResumeData } from './resume-parser.service';

type Db = DatabaseService | Prisma.TransactionClient;

/**
 * Shape of the data the applicant actually submits at apply time
 * (ApplyWithParsedDto). Mirrors the AutofillXDto fields the user could
 * have edited in the form, plus skills — this is what gets persisted,
 * NOT the raw FastAPI parser output.
 */
export interface SubmittedResumeData {
  personal: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    headline?: string;
    address?: string;
  };
  education: Array<{
    school: string;
    fieldOfStudy?: string;
    degree?: string;
    startDate?: string;
    endDate?: string;
  }>;
  experience: Array<{
    title: string;
    company?: string;
    industry?: string;
    summary?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
  }>;
  skills: AutofillSkillDto[];
}

@Injectable()
export class ResumeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly resumeParser: ResumeParserService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Parse-only, no persistence. Used by POST /resume/parse for the public
   */
  async parseResumePreview(
    file: UploadedResumeFileDto,
  ): Promise<ResumeParsePreviewDto> {
    const parsed = await this.resumeParser.parseResume(
      file.buffer,
      file.originalname,
    );

    if (!parsed) {
      throw new BadRequestException('Parser returned empty result');
    }

    return this.buildAutofillResponse(parsed);
  }

  /**
   * Uploads the file to Supabase AND creates the resume row, in one call
   */
  async attachResumeToCandidate(
    params: {
      file: UploadedResumeFileDto;
      candidateId: string;
      submitted: SubmittedResumeData;
    },
    db: Db = this.db,
  ) {
    const { file, candidateId, submitted } = params;

    const resumeUrl = await this.uploadToSupabase(file);

    // extractedSkills stays as a flat string[] — it's metadata used for
    // display/search only, not the ranking payload (that's parsedData.skills,
    // which keeps the {name, category} shape end-to-end).
    const extractedSkills = Array.from(
      new Map(
        (submitted.skills ?? [])
          .map((skill) => this.normalizeText(skill.name))
          .filter((name): name is string => Boolean(name))
          .map((name) => [name.toLowerCase(), name] as const),
      ).values(),
    );
    const extractedExperience = this.sumExperienceMonths(submitted.experience);
    const extractedEducation =
      this.normalizeText(submitted.education?.[0]?.degree) ?? null;

    return db.resume.create({
      data: {
        candidateId,
        resumeUrl,
        fileName: file.originalname,
        parsedData: submitted as unknown as object,
        extractedSkills: extractedSkills as unknown as object,
        extractedExperience,
        extractedEducation,
        isPrimary: false,
      },
    });
  }

  async uploadResumeFile(file: UploadedResumeFileDto) {
    const resumeUrl = await this.uploadToSupabase(file);

    return {
      resumeUrl,
      fileName: file.originalname,
    };
  }

  async createResumeRecord(
    params: {
      candidateId: string;
      resumeUrl: string;
      fileName: string;
      submitted: SubmittedResumeData;
    },
    db: Db = this.db,
  ) {
    const { candidateId, resumeUrl, fileName, submitted } = params;

    // extractedSkills stays as a flat string[] — it's metadata used for
    // display/search only, not the ranking payload (that's parsedData.skills,
    // which keeps the {name, category} shape end-to-end).
    const extractedSkills = Array.from(
      new Map(
        (submitted.skills ?? [])
          .map((skill) => this.normalizeText(skill.name))
          .filter((name): name is string => Boolean(name))
          .map((name) => [name.toLowerCase(), name] as const),
      ).values(),
    );
    const extractedExperience = this.sumExperienceMonths(submitted.experience);
    const extractedEducation =
      this.normalizeText(submitted.education?.[0]?.degree) ?? null;

    return db.resume.create({
      data: {
        candidateId,
        resumeUrl,
        fileName,
        parsedData: submitted as unknown as object,
        extractedSkills: extractedSkills as unknown as object,
        extractedExperience,
        extractedEducation,
        isPrimary: false,
      },
    });
  }


  /**
   * Bulk path: upload file + create Resume row with NO parsedData.
   * Parsing happens later in ResumeParseProcessor.
   */
  async uploadRawResumeForCandidate(
    params: {
      file: UploadedResumeFileDto;
      candidateId: string;
    },
    db: Db = this.db,
  ) {
    const { file, candidateId } = params;
    const resumeUrl = await this.uploadToSupabase(file);

    const resume = await db.resume.create({
      data: {
        candidateId,
        resumeUrl,
        fileName: file.originalname,
        parsedData: Prisma.DbNull,
        isPrimary: false,
      },
    });

    return resume;
  }

  /**
   * After FastAPI parse succeeds: persist structured data on the resume.
   */
  async saveParsedData(
    resumeId: string,
    parsed: ParsedResumeData,
    db: Db = this.db,
  ) {
    const extractedSkills = Array.from(
      new Map(
        (parsed.skills ?? [])
          .map((s) => this.normalizeText(s.name))
          .filter((name): name is string => Boolean(name))
          .map((name) => [name.toLowerCase(), name] as const),
      ).values(),
    );

    const extractedExperience = this.sumExperienceMonths(
      (parsed.experience ?? []).map((e) => ({
        title: e.title ?? '',
        company: e.company,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
      })),
    );

    const extractedEducation =
      this.normalizeText(parsed.education?.[0]?.degree) ?? null;

    return db.resume.update({
      where: { id: resumeId },
      data: {
        parsedData: parsed as unknown as object,
        extractedSkills: extractedSkills as unknown as object,
        extractedExperience,
        extractedEducation,
      },
    });
  }

  /**
   * Cleanup: called when a transaction fails AFTER the file was already
   * uploaded to storage (Prisma can roll back the row insert, but not the
   * external storage write).
   */
  async deleteStorageFile(resumeUrl: string): Promise<void> {
    const storagePath = this.storagePathFromUrl(resumeUrl);
    if (!storagePath) return;

    const supabase = this.supabaseService.getClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'resumes';
    await supabase.storage.from(bucket).remove([storagePath]);
  }

  async findById(id: string, db: Db = this.db) {
    return db.resume.findUnique({
      where: { id },
      select: {
        id: true,
        candidateId: true,
        resumeUrl: true,
      },
    });
  }

  async createResume(
    data: {
      candidateId: string;
      resumeUrl: string;
      parsedData?: object;
      extractedEducation?: string | null;
      extractedExperience?: number | null;
    },
    db: Db = this.db,
  ) {
    return db.resume.create({
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
    db: Db = this.db,
  ) {
    const existing = await this.findById(id, db);

    if (!existing) {
      throw new NotFoundException(`Resume with id ${id} not found`);
    }

    return db.resume.update({
      where: { id },
      data,
      select: {
        id: true,
        candidateId: true,
      },
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────

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

  private buildAutofillResponse(
    parsed: ParsedResumeData,
  ): ResumeParsePreviewDto {
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
      personal,
      education: this.mapEducation(parsed.education),
      experience: this.mapExperience(parsed.experience),
      skills: this.extractSkills(parsed.skills),
    };
  }

  private splitName(fullName: string): { firstName: string; lastName: string } {
    const trimmed = fullName.trim();
    if (!trimmed) return { firstName: 'Unknown', lastName: '' };

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: 'Unknown', lastName: '' };

    return {
      firstName: parts[0] ?? 'Unknown',
      lastName: parts.slice(1).join(' '),
    };
  }

  private formatDate(date: string | null | undefined): string | null {
    if (!date) return null;
    const trimmed = date.trim();
    if (!trimmed) return null;

    const isoMonthMatch = trimmed.match(/^(\d{4})-(\d{2})/);
    if (isoMonthMatch) return `${isoMonthMatch[2]}/${isoMonthMatch[1]}`;

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
    if (slashMatch) return `${slashMatch[1].padStart(2, '0')}/${slashMatch[2]}`;

    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) return `01/${yearMatch[1]}`;

    return null;
  }

  private mapEducation(
    educationList: ParsedResumeData['education'],
  ): AutofillEducationDto[] {
    if (!Array.isArray(educationList)) return [];

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
    if (!Array.isArray(experienceList)) return [];

    return experienceList.map((experience) => ({
      title: this.normalizeText(experience.title),
      company: this.normalizeText(experience.company),
      startDate: this.formatDate(experience.startDate),
      endDate: experience.endDate ? this.formatDate(experience.endDate) : null,
      isCurrent: Boolean((experience as { isCurrent?: boolean }).isCurrent),
      description: this.normalizeText(experience.description),
    }));
  }

  private extractSkills(
    skills: ParsedResumeData['skills'],
  ): AutofillSkillDto[] {
    if (!Array.isArray(skills)) return [];

    const seen = new Set<string>();
    const result: AutofillSkillDto[] = [];

    for (const skill of skills) {
      const name = this.normalizeText(skill.name);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      result.push({
        name,
        category: this.normalizeText(skill.category) ?? undefined,
      });
    }

    return result;
  }

  private sumExperienceMonths(
    experience: SubmittedResumeData['experience'],
  ): number | null {
    if (!Array.isArray(experience) || experience.length === 0) return null;

    let totalMonths = 0;
    let countedAny = false;

    for (const entry of experience) {
      const start = this.parseMonthYear(entry.startDate);
      if (!start) continue;

      const end = entry.isCurrent
        ? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
        : this.parseMonthYear(entry.endDate);
      if (!end) continue;

      const months = (end.year - start.year) * 12 + (end.month - start.month);
      if (months > 0) {
        totalMonths += months;
        countedAny = true;
      }
    }

    return countedAny ? totalMonths : null;
  }

  private parseMonthYear(
    value: string | null | undefined,
  ): { year: number; month: number } | null {
    if (!value) return null;
    const match = value.trim().match(/^(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month < 1 || month > 12) return null;

    return { year, month };
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
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

  private storagePathFromUrl(resumeUrl: string): string | null {
    const match = resumeUrl.match(/\/object\/public\/[^/]+\/(.+)$/);
    return match?.[1] ?? null;
  }
}
