import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { FASTAPI_ENDPOINTS } from '../constants/fastapi.constants';
import {
  ResumeParseResponse,
  RankRequest,
  RankResponse,
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  TranscriptionRequest,
  TranscriptionResponse,
  EvaluationRequest,
  EvaluationResponse,
} from './contracts';

@Injectable()
export class FastApiService {
  private readonly logger = new Logger(FastApiService.name);

  constructor(private readonly http: HttpService) {}

  async get<T = unknown>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>('get', path, undefined, config);
  }

  async post<T = unknown>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>('post', path, data, config);
  }

  /** Multipart file upload (used by resume parse). */
  async postForm<T = unknown>(
    path: string,
    form: FormData,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>('post', path, form, {
      ...config,
      headers: {
        ...form.getHeaders(),
        ...config?.headers,
      },
    });
  }

  rank(payload: RankRequest): Promise<RankResponse> {
    return this.post<RankResponse>(FASTAPI_ENDPOINTS.RANKING.RANK, payload);
  }

  parseResume(form: FormData): Promise<ResumeParseResponse> {
    return this.postForm<ResumeParseResponse>(
      FASTAPI_ENDPOINTS.RESUME.PARSE,
      form,
    );
  }

  generateQuestions(
    payload: QuestionGenerationRequest,
  ): Promise<QuestionGenerationResponse> {
    return this.post<QuestionGenerationResponse>(
      FASTAPI_ENDPOINTS.INTERVIEW.GENERATE_QUESTIONS,
      payload,
    );
  }

  transcribe(payload: TranscriptionRequest): Promise<TranscriptionResponse> {
    return this.post<TranscriptionResponse>(
      FASTAPI_ENDPOINTS.INTERVIEW.TRANSCRIBE,
      payload,
    );
  }

  evaluate(payload: EvaluationRequest): Promise<EvaluationResponse> {
    return this.post<EvaluationResponse>(
      FASTAPI_ENDPOINTS.INTERVIEW.EVALUATE,
      payload,
    );
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        method === 'get'
          ? this.http.get<T>(path, config)
          : this.http.post<T>(path, data, config),
      );
      return response.data;
    } catch (error) {
      this.handleError(error, path);
    }
  }

  private handleError(error: unknown, path: string): never {
    if (error instanceof AxiosError) {
      this.logger.error(
        `FastAPI ${path} → ${error.response?.status}: ${JSON.stringify(error.response?.data)}`,
      );
    } else {
      this.logger.error(`FastAPI ${path} failed`, error);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new BadRequestException(`FastAPI call failed (${path}): ${message}`);
  }
}
