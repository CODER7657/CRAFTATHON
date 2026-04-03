import AnalyticsCharts from '@/components/dashboard/AnalyticsCharts';
import { BarChart3 } from 'lucide-react';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';

type AnalyticsCase = {
  status: string;
  created_at: string;
  risk_score: number;
  jurisdiction: string;
};

function normalizeStatus(status: string | null | undefined): string {
  const value = (status || '').toLowerCase();
  if (value === 'flagged') return 'high_priority';
  if (value === 'assigned') return 'assigned';
  if (value === 'resolved') return 'resolved';
  if (value === 'submitted') return 'submitted';
  if (value === 'processing') return 'processing';
  return value || 'review';
}

export default async function AnalyticsPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8010';
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);
  
  let cases: AnalyticsCase[] = [];
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
    cases = (json.data?.cases || []).map((c: any) => ({
      status: normalizeStatus(c.status),
      created_at: c.created_at,
      risk_score: Number(c.risk_score || 0),
      jurisdiction: c.jurisdiction_code || 'UNKNOWN',
    }));
  } catch (err: any) {
    error = err;
  }

  if (error) {
    return (
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-400">
        <p className="text-rose-600 font-medium text-sm">Failed to load analytics data. Check backend URL/key in frontend env if needed.</p>
      </div>
    );
  }

  const reportsByStatus = cases.reduce((acc: any, curr: any) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  const reportsByJurisdiction = cases.reduce((acc: any, curr: any) => {
    acc[curr.jurisdiction] = (acc[curr.jurisdiction] || 0) + 1;
    return acc;
  }, {});

  const casesByDate = cases.reduce((acc: any, curr: any) => {
    const d = new Date(curr.created_at).toISOString().split('T')[0];
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md">
          <BarChart3 className="w-4.5 h-4.5 text-amber-400" />
        </div>
        <h1>Analytics Dashboard</h1>
        <div className="page-header-line" />
      </div>
      <AnalyticsCharts 
        statusData={reportsByStatus} 
        jurisdictionData={reportsByJurisdiction} 
        timelineData={casesByDate} 
      />
    </div>
  );
}
