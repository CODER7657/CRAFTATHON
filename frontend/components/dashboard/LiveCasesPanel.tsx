'use client';

import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import CasesTable from '@/components/dashboard/CasesTable';

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

const formatUpdatedTime = (value: Date) =>
  value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

export default function LiveCasesPanel({
  initialCases,
  initialError,
}: {
  initialCases: Case[];
  initialError?: string | null;
}) {
  const [cases, setCases] = useState<Case[]>(initialCases || []);
  const [error, setError] = useState<string | null>(initialError || null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLastUpdatedLabel(formatUpdatedTime(new Date()));

    const refresh = async () => {
      try {
        const res = await fetch('/portal/dashboard/cases', { cache: 'no-store' });
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.message || 'Failed to refresh cases');
        }

        if (!alive) return;
        setCases(json?.data?.cases || []);
        setError(null);
        setLastUpdatedLabel(formatUpdatedTime(new Date()));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Live update failed');
      }
    };

    const id = window.setInterval(refresh, 6000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const total = useMemo(() => cases.length, [cases]);

  if (error) {
    return (
      <div className="glass-card p-6 rounded-2xl border-l-4 border-rose-400">
        <p className="text-rose-600 font-medium text-sm">Error loading cases: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md">
          <LayoutDashboard className="w-4.5 h-4.5 text-amber-400" />
        </div>
        <h1>Active Cases</h1>
        <div className="page-header-line" />
        <span className="text-xs font-semibold text-navy-400 bg-navy-50 px-3 py-1.5 rounded-full border border-navy-100">
          {total} total
        </span>
      </div>

      <div className="text-xs text-navy-400">
        Live updates every 6s. Last updated: {lastUpdatedLabel ?? '--'}
      </div>

      <CasesTable cases={cases} />
    </div>
  );
}
