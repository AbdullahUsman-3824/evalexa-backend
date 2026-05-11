import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
} from '@nestjs/common';
import type { Express } from 'express';
import { ApplicationService } from '../../application/application.service';
import { ApplyWithParsedDto } from '../../application/dto/apply-with-parsed.dto';
import { JobsService } from '../../jobs/jobs.service';
import { ResumeService } from '../../resume/resume.service';
import { PublicJobApplicationDto } from '../dto/public-job-application.dto';
import { PublicJobsQueryDto } from '../dto/public-jobs-query.dto';

@Injectable()
export class PublicJobsService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly applicationService: ApplicationService,
    private readonly resumeService: ResumeService,
  ) {}

  async findAll(query: PublicJobsQueryDto) {
    return this.jobsService.findPublicJobs(query);
  }

  async findFeatured() {
    return this.jobsService.findFeaturedPublicJobs();
  }

  async findOne(jobSlug: string) {
    return this.jobsService.findPublicJobBySlug(jobSlug);
  }

  async findSimilar(jobSlug: string) {
    return this.jobsService.findSimilarPublicJobs(jobSlug);
  }

  private mapResumeEducation(
    education: Awaited<
      ReturnType<ResumeService['uploadAndProcess']>
    >['education'],
  ): ApplyWithParsedDto['education'] {
    return education
      .filter((item) => item.institution || item.degree || item.field)
      .map((item) => ({
        school: item.institution?.trim() || 'Unknown',
        fieldOfStudy: item.field ?? undefined,
        degree: item.degree ?? undefined,
        startDate: item.startDate ?? undefined,
        endDate: item.endDate ?? undefined,
      }));
  }

  private mapResumeExperience(
    experience: Awaited<
      ReturnType<ResumeService['uploadAndProcess']>
    >['experience'],
  ): ApplyWithParsedDto['experience'] {
    return experience
      .filter((item) => item.title || item.company || item.description)
      .map((item) => ({
        title: item.title?.trim() || 'Unknown',
        company: item.company ?? undefined,
        industry: undefined,
        summary: item.description ?? undefined,
        startDate: item.startDate ?? undefined,
        endDate: item.endDate ?? undefined,
        isCurrent: item.isCurrent,
      }));
  }

  async applyToJob(
    jobSlug: string,
    dto: PublicJobApplicationDto,
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Resume file is required');
    }

    const job = await this.jobsService.findPublicJobBySlug(jobSlug);

    if (job.applicationDeadline < new Date()) {
      throw new GoneException('This job posting has expired');
    }

    const uploadedResume = await this.resumeService.uploadAndProcess(file);

    const existingApplication =
      await this.applicationService.findByCandidateAndJob(
        uploadedResume.candidateId,
        job.id,
      );

    if (existingApplication) {
      throw new ConflictException('Application already exists for this job');
    }

    const applicationDto: ApplyWithParsedDto = {
      candidateId: uploadedResume.candidateId,
      resumeId: uploadedResume.resumeId,
      resumeUrl: uploadedResume.resumeUrl,
      jobId: job.id,
      companyId: job.company.id,
      personal: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email ?? uploadedResume.personal.email ?? undefined,
        phone: dto.phone ?? uploadedResume.personal.phone ?? undefined,
        headline:
          uploadedResume.personal.headline ?? dto.coverLetter ?? undefined,
        address: uploadedResume.personal.address ?? undefined,
      },
      education: this.mapResumeEducation(uploadedResume.education),
      experience: this.mapResumeExperience(uploadedResume.experience),
    };

    return this.applicationService.applyWithParsedData(applicationDto);
  }
}
