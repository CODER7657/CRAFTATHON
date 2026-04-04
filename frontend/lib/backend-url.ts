function normalizeInternalApiRoot(raw: string): string {
  let base = raw.trim().replace(/\/$/, '');
  if (base.endsWith('/api')) {
    return base;
  }
  return `${base}/api`;
}

/**
 * Python FastAPI base URL for server-side fetches (RSC, Route Handlers).
 *
 * Prefer INTERNAL_API_URL when Next.js runs in Docker behind Caddy: calling the public
 * https://craft.../api URL from inside the frontend container often fails (hairpin / routing).
 * Example: INTERNAL_API_URL=http://api:8010/api  (Docker Compose service name `api`).
 */
export function getBackendApiUrl(): string {
  const internal = process.env.INTERNAL_API_URL || process.env.BACKEND_INTERNAL_URL;
  if (typeof internal === 'string' && internal.trim()) {
    return normalizeInternalApiRoot(internal);
  }

  let base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8010').trim().replace(/\/$/, '');
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }
  return `${base}/api`;
}

/**
 * Browser / client: env may be `https://host` or `https://host/api` — normalize to a single `/api` suffix.
 */
export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw?.trim()) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured');
  }
  let base = raw.trim().replace(/\/$/, '');
  if (base.endsWith('/api')) {
    return base;
  }
  return `${base}/api`;
}
