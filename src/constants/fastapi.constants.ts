import 'dotenv/config';

const defaultFastApiBaseUrl = 'http://127.0.0.1:8000';

export const FASTAPI_BASE_URL = `${(process.env.FASTAPI_URL ?? defaultFastApiBaseUrl).replace(/\/$/, '')}/api/v1`;

export const FASTAPI_ENDPOINTS = {
  RESUME: {
    PARSE: `${FASTAPI_BASE_URL}/resume/parse`,
    HEALTH: '/health',
  },
} as const;
