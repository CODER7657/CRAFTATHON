'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, LinkIcon, Filter } from 'lucide-react';
import { formatDateOrFallback, parseDateSafely } from '@/lib/date';

type Case = {
  tracking_id: string;
  jurisdiction_code?: string | null;
  status: string;
  risk_score?: number | null;
  ai_label?: string | null;
  created_at: string;
  authority_action?: string | null;
  onchain_tx_hash?: string | null;
};

export default function CasesTable({ cases }: { cases: Case[] }) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      
      if (filterDate === '7days') {
        const rowDate = parseDateSafely(c.created_at);
        if (!rowDate) return false;
        const limit = new Date();
        limit.setDate(limit.getDate() - 7);
        if (rowDate < limit) return false;
      } else if (filterDate === '30days') {
        const rowDate = parseDateSafely(c.created_at);
        if (!rowDate) return false;
        const limit = new Date();
        limit.setDate(limit.getDate() - 30);
        if (rowDate < limit) return false;
      }
      return true;
    });
  }, [cases, filterStatus, filterDate]);

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'bg-gradient-to-r from-rose-500 to-rose-600 text-white';
    if (score >= 50) return 'bg-gradient-to-r from-amber-400 to-amber-500 text-navy-900';
    return 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white';
  };

  const getStatusBadge = (status: string) => {
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

  const getRiskLevel = (score: number) => {
    if (score >= 80) return 'Harmful';
    if (score >= 50) return 'Review';
    return 'Low';
  };

  const getRecommendedAction = (score: number, status: string) => {
    if (status === 'resolved') return 'No action needed';
    if (score >= 80) return 'Escalate immediately';
    if (score >= 50) return 'Assign and investigate';
    return 'Standard review';
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden shadow-glass">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-5 border-b border-navy-100/60">
        <div className="flex items-center gap-2 text-xs font-semibold text-navy-500 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" />
          Filters
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select-modern">
          <option value="all">All Statuses</option>
          <option value="submitted">Submitted</option>
          <option value="processing">Processing</option>
          <option value="review">Review</option>
          <option value="flagged">Flagged</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
        </select>
        
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} className="select-modern">
          <option value="all">All Time</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>

        <span className="ml-auto text-xs text-navy-400 font-medium">
          {filteredCases.length} result{filteredCases.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Date</th>
              <th>Risk Score</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th className="bg-navy-100/40 border-l border-navy-200/40">
                <span className="flex items-center gap-1.5">
                  <LinkIcon className="w-3 h-3" />
                  Blockchain
                </span>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map(c => (
              <tr key={c.tracking_id}>
                <td className="font-mono text-xs text-navy-600 font-medium">{c.tracking_id.substring(0, 8)}...</td>
                <td className="text-navy-600">{formatDateOrFallback(c.created_at)}</td>
                <td>
                  <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-lg text-xs font-bold ${getRiskColor(Number(c.risk_score || 0))}`}>
                    {Number(c.risk_score || 0)}
                  </span>
                  <div className="text-[11px] text-navy-400 mt-1 font-semibold uppercase tracking-wide">
                    {getRiskLevel(Number(c.risk_score || 0))}
                  </div>
                </td>
                <td>
                  <span className={`${getStatusBadge(c.status)} capitalize`}>
                    {c.status}
                  </span>
                </td>
                <td className="text-navy-500 text-sm">
                  {c.authority_action || <span className="italic text-navy-300">Unassigned</span>}
                  <div className="text-[11px] text-navy-400 mt-1">{getRecommendedAction(Number(c.risk_score || 0), c.status)}</div>
                </td>
                <td className="bg-navy-50/30 border-l border-navy-100/40 text-center">
                  {c.onchain_tx_hash ? (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${c.onchain_tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 text-xs font-semibold transition-colors"
                    >
                      {`${c.onchain_tx_hash.slice(0, 8)}...`}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-navy-300">
                      {['submitted', 'processing'].includes(c.status)
                        ? 'Not logged yet'
                        : 'On-chain pending'}
                    </span>
                  )}
                </td>
                <td>
                  <Link href={`/cases/${c.tracking_id}`} className="inline-flex items-center gap-1.5 text-amber-600 hover:text-amber-700 font-semibold text-xs transition-colors">
                    View Details
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {filteredCases.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-navy-300 text-sm">No cases matched your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
