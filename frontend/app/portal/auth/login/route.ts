import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_SESSION_COOKIE,
  createAuthoritySessionToken,
  findAccountByEmail,
  getAuthorityAccounts,
  getSessionMaxAgeSeconds,
  verifyAccountPassword,
} from '@/lib/auth/session';

/**
 * Lives under /portal/* so production reverse proxies can send /api/* only to FastAPI.
 * Do not move back to /api/auth/* on unified hosts (you will get 404 from the backend).
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '').trim();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: 'missing_credentials', message: 'Email and password are required' } },
        { status: 400 }
      );
    }

    if (getAuthorityAccounts().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'auth_not_configured',
            message:
              'No authority accounts are configured. Set AUTH_USER_1_EMAIL, AUTH_USER_1_PASSWORD_HASH, AUTH_USER_1_AUTHORITY_API_KEY, and related vars in .env.local, then restart the dev server.',
          },
        },
        { status: 503 }
      );
    }

    const account = findAccountByEmail(email);
    if (!account || !verifyAccountPassword(account, password)) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_credentials', message: 'Invalid credentials' } },
        { status: 401 }
      );
    }

    const token = createAuthoritySessionToken(account.id);
    const response = NextResponse.json({
      success: true,
      data: {
        account_id: account.id,
        name: account.name,
        jurisdiction: account.jurisdiction,
      },
    });

    response.cookies.set({
      name: AUTH_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getSessionMaxAgeSeconds(),
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to process login request';
    if (message.includes('Missing AUTH_SESSION_SECRET')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'missing_session_secret',
            message: 'Server misconfiguration: set AUTH_SESSION_SECRET in .env.local and restart.',
          },
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'invalid_request', message: 'Unable to process login request' } },
      { status: 400 }
    );
  }
}
