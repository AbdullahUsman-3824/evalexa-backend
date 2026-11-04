import 'dotenv/config';

const defaultFastApiBaseUrl = 'http://127.0.0.1:8000';

export const FASTAPI_BASE_URL = `${(process.env.FASTAPI_URL ?? defaultFastApiBaseUrl).replace(/\/$/, '')}/api/v1`;

export const FASTAPI_ENDPOINTS = {
  RESUME: {
    PARSE: '/resume/parse',
  },
  RANKING: {
    RANK: '/rank',
  },
  INTERVIEW: {
    GENERATE_QUESTIONS: '/interview/generate-questions',
    TRANSCRIBE: '/interview/transcribe',
    EVALUATE: '/interview/evaluate',
  },
} as const;
