export function normalizeText(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeEmail(value?: string): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : undefined;
}
    