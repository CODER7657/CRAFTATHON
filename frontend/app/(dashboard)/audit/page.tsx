import { ScrollText, Shield, ExternalLink } from 'lucide-react';
import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE, getAuthorityFromToken } from '@/lib/auth/session';

type AuditLog = {
  id: string;
  created_at: string;
  authority_name: string;
  action_type: string;
  case_id: string;
  verified_on_chain: boolean;
  tx_hash: string | null;
};

export default async function AuditPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8010';
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  const account = getAuthorityFromToken(token);
  let logs: AuditLog[] = [];
  let error: { message: string } | null = null;

  if (!account) {
    return (
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-400">
        <p className="text-rose-600 font-medium text-sm">Session expired. Please login again.</p>
      </div>
    );
  }

  try {
    const response = await fetch(`${apiBase}/api/dashboard/cases`, {
      cache: 'no-store',
      headers: {
        'X-Authority-Api-Key': account.authorityApiKey,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch dashboard cases');
    }
    const json = await response.json();
    const cases = json.data?.cases || [];
    logs = cases.map((c: any) => ({
      id: `case_${c.tracking_id}`,
      created_at: c.created_at,
      authority_name: account.name,
      action_type: c.authority_action || c.status,
      case_id: c.tracking_id,
      verified_on_chain: Boolean(c.onchain_tx_hash),
      tx_hash: c.onchain_tx_hash || null,
    }));
  } catch (err: any) {
    error = { message: err.message || 'Failed to load activity feed' };
  }

  if (error) {
    return (
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-400">
        <p className="text-rose-600 font-medium text-sm">Error loading audit logs: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md">
          <ScrollText className="w-4.5 h-4.5 text-amber-400" />
        </div>
        <h1>Audit Log</h1>
        <div className="page-header-line" />
        <span className="text-xs font-semibold text-navy-400 bg-navy-50 px-3 py-1.5 rounded-full border border-navy-100">
          {logs?.length || 0} entries
        </span>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden shadow-glass">
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Authority</th>
                <th>Action</th>
                <th>Case ID</th>
                <th>
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3" />
                    Blockchain
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="text-navy-500 text-sm whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="font-semibold text-navy-700 text-sm">{log.authority_name}</td>
                  <td>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-navy-50 border border-navy-100 text-navy-600 text-[10px] uppercase tracking-wider font-bold">
                      {log.action_type}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-navy-400">{log.case_id.substring(0, 8)}...</td>
                  <td>
                    {log.verified_on_chain && log.tx_hash ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          Verified
                        </span>
                        <a 
                          href={`https://sepolia.etherscan.io/tx/${log.tx_hash}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 text-xs font-semibold transition-colors"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-navy-200">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
               <tr><td colSpan={5} className="py-12 text-center text-navy-300 text-sm">No audit logs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
