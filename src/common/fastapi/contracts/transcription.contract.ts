export enum AnswerStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EMPTY_AUDIO = 'EMPTY_AUDIO',
  UNINTELLIGIBLE = 'UNINTELLIGIBLE',
}

export enum InterviewTranscriptionStatus {
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  FAILED = 'FAILED',
}

export enum TranscriptionErrorCode {
  AUDIO_PROCESSING_FAILED = 'AUDIO_PROCESSING_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  EMPTY_AUDIO = 'EMPTY_AUDIO',
  UNINTELLIGIBLE = 'UNINTELLIGIBLE',
  AUDIO_TOO_LARGE = 'AUDIO_TOO_LARGE',
  AUDIO_TOO_LONG = 'AUDIO_TOO_LONG',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  UNSAFE_URL = 'UNSAFE_URL',
  CORRUPTED_MEDIA = 'CORRUPTED_MEDIA',
  MISSING_AUDIO_TRACK = 'MISSING_AUDIO_TRACK',
}

export const SUPPORTED_MIME_TYPES = [
  'audio/webm',
  'video/webm',
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'video/mp4',
  'audio/ogg',
  'audio/flac',
  'audio/x-wav',
  'audio/x-m4a',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export interface AnswerRecording {
  questionId: string; // 3-128 chars: letters, digits, _ and -
  mediaUrl: string; // http(s) URL, max 2048
  mimeType: SupportedMimeType;
}

export interface TranscriptionRequest {
  interviewId: string;
  language?: string | null; // BCP-47 like 'en', 'ur', 'zh-tw'. Omit to auto-detect
  answers: AnswerRecording[]; // 1 to 50 items, unique questionId
}

export interface TranscriptionError {
  code: TranscriptionErrorCode;
  message: string;
}

export interface AnswerTranscriptionResult {
  questionId: string;
  status: AnswerStatus;
  transcript: string | null;
  detectedLanguage: string | null;
  durationSeconds: number | null;
  error: TranscriptionError | null;
}

export interface TranscriptionResponse {
  interviewId: string;
  status: InterviewTranscriptionStatus;
  results: AnswerTranscriptionResult[];
}