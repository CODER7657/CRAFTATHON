import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_SESSION_COOKIE,
  createAuthoritySessionToken,
  findAccountByEmail,
  getSessionMaxAgeSeconds,
  verifyAccountPassword,
} from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: 'missing_credentials', message: 'Email and password are required' } },
        { status: 400 }
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
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_request', message: 'Unable to process login request' } },
      { status: 400 }
    );
  }
}
