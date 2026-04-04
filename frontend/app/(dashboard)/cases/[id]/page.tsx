import { notFound, redirect } from 'next/navigation';
import CaseActions from '@/components/dashboard/CaseActions';
import { Shield, Clock, AlertTriangle, Cpu } from 'lucide-react';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';
import { getBackendApiUrl } from '@/lib/backend-url';
import { formatDateTimeOrFallback } from '@/lib/date';

type DashboardCase = {
  tracking_id: string;
  jurisdiction_code?: string | null;
  status: string;
  risk_score?: number | null;
  ai_label?: string | null;
  created_at: string;
  authority_action?: string | null;
};

async function fetchCase(trackingId: string, authorityKey: string): Promise<DashboardCase | null> {
  const apiBase = getBackendApiUrl();

  const response = await fetch(`${apiBase}/dashboard/cases`, {
    cache: 'no-store',
    headers: {
      'X-Authority-Api-Key': authorityKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const cases: DashboardCase[] = json.data?.cases || [];
  return cases.find((c) => c.tracking_id === trackingId) || null;
}

async function fetchCaseStatus(trackingId: string): Promise<any | null> {
  const apiBase = getBackendApiUrl();

  const response = await fetch(`${apiBase}/report/status/${trackingId}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  return json.data || null;
}

export default async function CaseDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);
  if (!account) {
    redirect('/login');
  }

  let caseRow = await fetchCase(id, account.authorityApiKey);

  // Fallback path: if a row isn't visible in dashboard list (or env was missing),
  // still try direct status lookup so valid tracking IDs don't hard-404.
  if (!caseRow) {
    const status = await fetchCaseStatus(id);
    if (status) {
      caseRow = {
        tracking_id: status.tracking_id || id,
        status: status.status || 'submitted',
        risk_score: status.risk_score,
        ai_label: status.ai_label,
        created_at: status.last_updated_at || new Date().toISOString(),
        authority_action: status.authority_action,
      };
    }
  }

  if (!caseRow) return notFound();

  const statusDetails = await fetchCaseStatus(id);

  async function performAction(actionType: string) {
    'use server';

    const apiBase = getBackendApiUrl();
    const sessionToken = cookies().get(AUTH_SESSION_COOKIE)?.value;
    const sessionAccount = getAuthorityFromToken(sessionToken);
    if (!sessionAccount) {
      throw new Error('Unauthorized session');
    }

    const actionMap: Record<string, string> = {
      assign: 'investigating',
      escalate: 'escalated',
      resolve: 'resolved',
    };

    const action = actionMap[actionType] || 'reviewed';
    const response = await fetch(`${apiBase}/authority/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Authority-Api-Key': sessionAccount.authorityApiKey,
      },
      body: JSON.stringify({
        tracking_id: id,
        action,
        notes: `frontend_action:${actionType}`,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Action failed: ${body}`);
    }
  }

  const getStatusStyle = (status: string) => {
    const map: Record<string, string> = {
      submitted: 'badge badge-pending',
      processing: 'badge badge-reviewing',
      review: 'badge badge-reviewing',
      flagged: 'badge badge-escalated',
      assigned: 'badge badge-escalated',
      resolved: 'badge badge-resolved',
    };
    return map[status] || 'badge bg-navy-100 text-navy-700';
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'from-rose-500 to-rose-600 text-white';
    if (score >= 50) return 'from-amber-400 to-amber-500 text-navy-900';
    return 'from-emerald-400 to-teal-500 text-white';
  };

  const currentRisk = Number(caseRow.risk_score || 0);
  const recommendedAction =
    caseRow.status === 'resolved'
      ? 'Case already resolved; no immediate action needed.'
      : currentRisk >= 80
        ? 'High priority: escalate immediately and preserve evidence chain.'
        : currentRisk >= 50
          ? 'Medium priority: assign and investigate with expedited review.'
          : 'Lower priority: keep under standard review and monitor updates.';

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="glass-card rounded-2xl overflow-hidden shadow-glass">
        <div className="h-1.5 bg-gradient-to-r from-navy-600 via-amber-400 to-navy-600" />
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md flex-shrink-0">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-navy-800 tracking-tight">Case Details</h1>
              <p className="text-xs font-mono text-navy-400 mt-0.5">{caseRow.tracking_id}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-navy-400">
                <Clock className="w-3.5 h-3.5" />
                Submitted: {formatDateTimeOrFallback(caseRow.created_at)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <span className={`${getStatusStyle(caseRow.status)} capitalize text-sm px-4 py-1.5`}>
              {caseRow.status}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-sm bg-gradient-to-r ${getRiskColor(Number(caseRow.risk_score || 0))}`}>
              Risk: {Number(caseRow.risk_score || 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl overflow-hidden shadow-glass">
          <div className="h-1 bg-gradient-to-r from-navy-500 to-navy-700" />
          <div className="p-6">
            <h2 className="text-base font-bold text-navy-800 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-navy-50 border border-navy-100 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-navy-500" />
              </div>
              AI Risk Breakdown
            </h2>
            <pre className="bg-navy-50/80 border border-navy-100 p-4 rounded-xl text-sm overflow-x-auto text-navy-700 font-mono leading-relaxed">
              {JSON.stringify(statusDetails?.confidence_explanation || { note: 'No explanation available yet' }, null, 2)}
            </pre>
          </div>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden shadow-glass">
          <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <div className="p-6 space-y-5">
            <h2 className="text-base font-bold text-navy-800">Authority Actions</h2>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Blockchain tx details are available during action response and audit logs.
            </div>
            <div className="px-4 py-3 rounded-xl bg-navy-50 border border-navy-100 text-navy-700 text-sm font-medium">
              Recommended action policy: {recommendedAction}
            </div>
            <div className="pt-4 border-t border-navy-100">
              <CaseActions performAction={performAction} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
