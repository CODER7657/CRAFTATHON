export function parseDateSafely(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function toIsoDateOrFallback(value: unknown, fallback = 'unknown'): string {
  const parsed = parseDateSafely(value);
  return parsed ? parsed.toISOString().split('T')[0] : fallback;
}

export function formatDateOrFallback(value: unknown, fallback = 'N/A'): string {
  const parsed = parseDateSafely(value);
  return parsed ? parsed.toLocaleDateString() : fallback;
}

export function formatDateTimeOrFallback(value: unknown, fallback = 'N/A'): string {
  const parsed = parseDateSafely(value);
  return parsed ? parsed.toLocaleString() : fallback;
}