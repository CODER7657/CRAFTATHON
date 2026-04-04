import LiveCasesPanel from '@/components/dashboard/LiveCasesPanel';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';
import { getBackendApiUrl } from '@/lib/backend-url';

export default async function CasesPage() {
  const apiBase = getBackendApiUrl();
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);
  let cases = null;
  let error = null;

  if (!account) {
    return (
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-400">
        <p className="text-rose-600 font-medium text-sm">Session expired. Please login again.</p>
      </div>
    );
  }

  try {
    const res = await fetch(`${apiBase}/dashboard/cases`, {
      headers: {
        'X-Authority-Api-Key': account.authorityApiKey,
      },
      cache: 'no-store'
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`API fetch failed (${res.status}). ${detail.slice(0, 120)}`);
    }
    const json = await res.json();
    cases = json.data?.cases || [];
  } catch (err: unknown) {
    const e = err as { message?: string; cause?: { code?: string } };
    const msg = e?.message || 'Request failed';
    const is401 = /\b401\b/.test(msg) || /invalid_authority_key/i.test(msg);
    const netHint =
      !is401 &&
      (e?.cause?.code === 'ECONNREFUSED' || /fetch|network|ECONNREFUSED/i.test(msg))
        ? ' If Next runs in Docker, set INTERNAL_API_URL=http://api:8010/api (see docker-compose).'
        : '';
    const authHint = is401
      ? ' Seed public.authorities (see supabase_sql/seed_authorities_dev.sql and README). MOCK_EXTERNAL_SERVICES=true bypasses DB for the whole API—prefer seeding when using Postgres.'
      : '';
    error = { message: msg + netHint + authHint };
  }

  if (error) {
    return (
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-400">
        <p className="text-rose-600 font-medium text-sm">Error loading cases: {error.message}. Check backend URL/key in frontend env if needed.</p>
      </div>
    );
  }

  return <LiveCasesPanel initialCases={cases || []} initialError={null} />;
}
