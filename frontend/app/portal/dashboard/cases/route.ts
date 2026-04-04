import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';
import { getBackendApiUrl } from '@/lib/backend-url';

export const runtime = 'nodejs';

export async function GET() {
  const apiBase = getBackendApiUrl();
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);

  if (!account) {
    return NextResponse.json(
      { message: 'Session expired. Please login again.' },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(`${apiBase}/dashboard/cases`, {
      headers: {
        'X-Authority-Api-Key': account.authorityApiKey,
      },
      cache: 'no-store',
    });

    const json = await res.json();
    return NextResponse.json(json, {
      status: res.status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Failed to fetch dashboard cases from backend.' },
      { status: 502 }
    );
  }
}
