import LiveCasesPanel from '@/components/dashboard/LiveCasesPanel';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';

export default async function CasesPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8010';
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
    const res = await fetch(`${apiBase}/api/dashboard/cases`, {
      headers: {
        'X-Authority-Api-Key': account.authorityApiKey,
      },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('API fetch failed');
    const json = await res.json();
    cases = json.data?.cases || [];
  } catch (err: any) {
    error = { message: err.message };
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
