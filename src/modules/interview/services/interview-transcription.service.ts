import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnswerStatus,
  SUPPORTED_MIME_TYPES,
  SupportedMimeType,
  TranscriptionResponse,
} from '../../../common/fastapi/contracts';
import { FastApiService } from '../../../common/fastapi/fastapi.service';
import { DatabaseService } from '../../../database/database.service';
import { SupabaseService } from '../../../database/supabase.service';
import {
  AnswerTranscriptionStatus as PrismaAnswerTranscriptionStatus,
  RecordingUploadStatus,
  TranscriptionStatus,
} from '@prisma/client';

@Injectable()
export class InterviewTranscriptionService {
  private readonly signedUrlLifetimeSeconds = 300;

  constructor(
    private readonly db: DatabaseService,
    private readonly fastApi: FastApiService,
    private readonly supabase: SupabaseService,
  ) {}

  async transcribeAnswer(interviewId: string, questionId: string) {
    const answer = await this.db.interviewAnswer.findFirst({
      where: {
        questionId,
        question: { interviewId },
      },
      select: {
        id: true,
        questionId: true,
        answerText: true,
        durationSeconds: true,
        transcriptionStatus: true,
        question: {
          select: {
            interview: { select: { id: true, language: true } },
          },
        },
        recording: {
          select: {
            storageKey: true,
            mimeType: true,
            uploadStatus: true,
          },
        },
      },
    });

    if (!answer) {
      throw new NotFoundException('Interview answer not found');
    }
    if (!answer.recording) {
      throw new BadRequestException('Interview answer has no recording');
    }
    if (
      answer.transcriptionStatus === PrismaAnswerTranscriptionStatus.PROCESSING
    ) {
      throw new ConflictException(
        'Interview answer transcription is in progress',
      );
    }
    if (answer.recording.uploadStatus !== RecordingUploadStatus.UPLOADED) {
      throw new BadRequestException('Interview recording is not uploaded');
    }
    if (
      !SUPPORTED_MIME_TYPES.includes(
        answer.recording.mimeType as SupportedMimeType,
      )
    ) {
      throw new BadRequestException(
        `Unsupported recording MIME type: ${answer.recording.mimeType}`,
      );
    }

    const signedUrlResult = await this.supabase.createSignedDownloadUrl(
      answer.recording.storageKey,
      this.signedUrlLifetimeSeconds,
    );

    const claim = await this.db.interviewAnswer.updateMany({
      where: {
        id: answer.id,
        transcriptionStatus: {
          not: PrismaAnswerTranscriptionStatus.PROCESSING,
        },
      },
      data: {
        transcriptionStatus: PrismaAnswerTranscriptionStatus.PROCESSING,
        transcriptionError: null,
      },
    });
    if (claim.count !== 1) {
      throw new ConflictException(
        'Interview answer transcription is in progress',
      );
    }

    let response: TranscriptionResponse;
    try {
      response = await this.fastApi.transcribe({
        language: answer.question.interview.language,
        answer: {
          questionId: answer.questionId,
          mediaUrl: signedUrlResult.signedUrl,
          mimeType: answer.recording.mimeType as SupportedMimeType,
        },
      });
    } catch (error) {
      await this.db.interviewAnswer.update({
        where: { id: answer.id },
        data: {
          transcriptionStatus: PrismaAnswerTranscriptionStatus.FAILED,
          transcriptionError: JSON.stringify({
            code: 'TRANSCRIPTION_REQUEST_FAILED',
            message:
              error instanceof Error
                ? error.message
                : 'Transcription request failed',
          }),
        },
      });
      throw error;
    }

    const result = response.result;
    if (
      !result ||
      result.questionId !== answer.questionId ||
      !Object.values(AnswerStatus).includes(result.status)
    ) {
      throw new BadRequestException('Invalid transcription response');
    }

    await this.db.interviewAnswer.update({
      where: { id: answer.id },
      data: {
        answerText: result.transcript ?? undefined,
        transcriptionStatus: this.toPrismaAnswerStatus(result.status),
        transcriptionError: result.error ? JSON.stringify(result.error) : null,
        durationSeconds:
          result.durationSeconds === null
            ? answer.durationSeconds
            : Math.round(result.durationSeconds),
      },
    });

    const interviewStatus =
      await this.getInterviewTranscriptionStatus(interviewId);
    await this.db.interview.update({
      where: { id: interviewId },
      data: {
        transcriptionStatus: this.toPrismaInterviewStatus(interviewStatus),
      },
    });

    return {
      success: true,
      data: {
        interviewId,
        questionId: answer.questionId,
        status: result.status,
        transcript: result.transcript,
        detectedLanguage: result.detectedLanguage,
        durationSeconds: result.durationSeconds,
        error: result.error,
      },
    };
  }

  private toPrismaAnswerStatus(
    status: AnswerStatus,
  ): PrismaAnswerTranscriptionStatus {
    return status as PrismaAnswerTranscriptionStatus;
  }

  private toPrismaInterviewStatus(
    status: TranscriptionStatus,
  ): TranscriptionStatus {
    return status;
  }

  private async getInterviewTranscriptionStatus(
    interviewId: string,
  ): Promise<TranscriptionStatus> {
    const answers = await this.db.interviewAnswer.findMany({
      where: { question: { interviewId } },
      select: { transcriptionStatus: true },
    });
    const statuses = answers.map(({ transcriptionStatus }) =>
      transcriptionStatus === PrismaAnswerTranscriptionStatus.PROCESSING
        ? TranscriptionStatus.PROCESSING
        : transcriptionStatus,
    );

    if (
      statuses.includes(PrismaAnswerTranscriptionStatus.PENDING) ||
      statuses.includes(PrismaAnswerTranscriptionStatus.PROCESSING)
    ) {
      return TranscriptionStatus.PROCESSING;
    }

    const successful = statuses.filter(
      (status) => status === PrismaAnswerTranscriptionStatus.COMPLETED,
    ).length;
    const failed = statuses.length - successful;

    if (failed === 0) {
      return TranscriptionStatus.COMPLETED;
    }
    if (successful === 0) {
      return TranscriptionStatus.FAILED;
    }
    return TranscriptionStatus.PARTIALLY_COMPLETED;
  }
}
