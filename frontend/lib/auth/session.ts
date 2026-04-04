import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

export const AUTH_SESSION_COOKIE = 'authority_session';
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  sub: string;
  exp: number;
};

export type AuthorityAccount = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  jurisdiction: string;
  authorityApiKey: string;
};

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSessionSecret(): string {
  const secret = envTrim('AUTH_SESSION_SECRET');
  if (!secret) {
    throw new Error('Missing AUTH_SESSION_SECRET');
  }
  return secret;
}

/** Strip whitespace and optional surrounding quotes (common in .env copy-paste). */
function envTrim(key: string): string | undefined {
  const raw = process.env[key];
  if (raw == null) {
    return undefined;
  }
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.trim() || undefined;
}

function readAccount(index: 1 | 2): AuthorityAccount | null {
  const email = envTrim(`AUTH_USER_${index}_EMAIL`);
  const passwordHash =
    envTrim(`AUTH_USER_${index}_PASSWORD_HASH`) || envTrim(`AUTH_USER_${index}_HASH`);
  const name = envTrim(`AUTH_USER_${index}_NAME`);
  const jurisdiction = envTrim(`AUTH_USER_${index}_JURISDICTION`);
  const authorityApiKey =
    envTrim(`AUTH_USER_${index}_AUTHORITY_API_KEY`) || envTrim(`AUTH_USER_${index}_API_KEY`);

  if (!email || !passwordHash || !name || !jurisdiction || !authorityApiKey) {
    return null;
  }

  return {
    id: `authority-${index}`,
    email: email.toLowerCase(),
    passwordHash,
    name,
    jurisdiction,
    authorityApiKey,
  };
}

export function getAuthorityAccounts(): AuthorityAccount[] {
  return [readAccount(1), readAccount(2)].filter((a): a is AuthorityAccount => Boolean(a));
}

export function findAccountByEmail(email: string): AuthorityAccount | null {
  const target = email.trim().toLowerCase();
  return getAuthorityAccounts().find((account) => account.email === target) || null;
}

export function getAccountById(accountId: string): AuthorityAccount | null {
  return getAuthorityAccounts().find((account) => account.id === accountId) || null;
}

// Password hash format: "salt:hexDigest" where hexDigest = scrypt(password, salt, 64).
export function verifyAccountPassword(account: AuthorityAccount, password: string): boolean {
  const combined = account.passwordHash.trim();
  const colon = combined.indexOf(':');
  if (colon <= 0) {
    return false;
  }
  const salt = combined.slice(0, colon).trim();
  const storedHex = combined.slice(colon + 1).trim();
  if (!salt || !storedHex || !/^[0-9a-f]+$/i.test(storedHex)) {
    return false;
  }

  const derived = scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(storedHex, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createAuthoritySessionToken(accountId: string): string {
  const payload: SessionPayload = {
    sub: accountId,
    exp: Math.floor(Date.now() / 1000) + AUTH_SESSION_TTL_SECONDS,
  };

  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', getSessionSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyAuthoritySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, sig] = parts;
  const expected = createHmac('sha256', getSessionSecret()).update(`${header}.${body}`).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (!payload.sub || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getAuthorityFromToken(token: string | null | undefined): AuthorityAccount | null {
  if (!token) {
    return null;
  }
  const payload = verifyAuthoritySessionToken(token);
  if (!payload) {
    return null;
  }
  return getAccountById(payload.sub);
}

export function getSessionMaxAgeSeconds(): number {
  return AUTH_SESSION_TTL_SECONDS;
}
