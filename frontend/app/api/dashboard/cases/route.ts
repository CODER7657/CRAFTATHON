import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';

export async function GET() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8010';
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);

  if (!account) {
    return NextResponse.json(
      { message: 'Session expired. Please login again.' },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(`${apiBase}/api/dashboard/cases`, {
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
