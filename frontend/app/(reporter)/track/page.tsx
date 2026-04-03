'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Shield, ArrowRight, ArrowLeft, Home } from 'lucide-react';

export default function TrackLookupPage() {
  const router = useRouter();
  const [trackingId, setTrackingId] = useState('');

  const handleLookup = () => {
    const id = trackingId.trim();
    if (!id) {
      return;
    }
    router.push(`/track/${encodeURIComponent(id)}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <div className="glass-card p-8 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-navy-800">Track Your Report</h1>
            <p className="text-sm text-navy-400">Enter the tracking ID you received after submission.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-navy-300">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleLookup();
                }
              }}
              placeholder="Paste tracking ID (example: 123e4567-e89b-12d3-a456-426614174000)"
              className="input-modern pl-11"
            />
          </div>

          <button onClick={handleLookup} className="btn-primary w-full" disabled={!trackingId.trim()}>
            Check Status <ArrowRight className="ml-2 w-4 h-4" />
          </button>

          <p className="text-xs text-navy-400 text-center">
            New report?{' '}
            <Link href="/report" className="text-amber-600 hover:text-amber-700 font-semibold">
              Submit here
            </Link>
          </p>

          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/report" className="btn-secondary inline-flex items-center justify-center">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Return to Report Form
            </Link>
            <Link href="/" className="btn-secondary inline-flex items-center justify-center">
              <Home className="mr-2 w-4 h-4" />
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
