/**
 * FastAPI endpoint paths.
 * All paths are relative to the baseURL configured in AppModule.
 */
export const FASTAPI_ENDPOINTS = {
  RESUME: {
    PARSE: '/resume/parse',
    HEALTH: '/health',
  },
} as const;
