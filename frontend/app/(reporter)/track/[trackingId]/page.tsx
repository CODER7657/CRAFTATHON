import { getReportStatus } from '@/lib/api/report';
import Link from 'next/link';
import { Shield, Clock, CheckCircle2, Search, Users, FileCheck, ArrowLeft, Home } from 'lucide-react';
import { formatDateTimeOrFallback } from '@/lib/date';

export default async function TrackingPage(props: { params: Promise<{ trackingId: string }> }) {
    const { trackingId } = await props.params;
    let statusInfo;

    try {
        statusInfo = await getReportStatus(trackingId);
    } catch (e) {
        return (
            <div className="max-w-2xl mx-auto p-6 animate-fade-in">
                <div className="glass-card p-8 rounded-2xl text-center">
                    <div className="w-14 h-14 mx-auto mb-4 bg-rose-100 rounded-2xl flex items-center justify-center">
                        <Shield className="w-7 h-7 text-rose-500" />
                    </div>
                    <h1 className="text-xl font-bold text-navy-800 mb-2">Unable to Fetch Status</h1>
                    <p className="text-navy-400 text-sm mb-6">Could not retrieve status for tracking ID: <span className="font-mono text-navy-600">{trackingId}</span></p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/track" className="btn-secondary inline-flex items-center justify-center">
                            <ArrowLeft className="mr-2 w-4 h-4" />
                            Try Another Tracking ID
                        </Link>
                        <Link href="/report" className="btn-primary inline-flex items-center justify-center">
                            Submit Another Report
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const timeline = [
        { label: 'Submitted', icon: FileCheck, desc: 'Report received securely' },
        { label: 'AI Review', icon: Search, desc: 'Automated risk analysis' },
        { label: 'Authority Assigned', icon: Users, desc: 'Case assigned to authority' },
        { label: 'Resolved', icon: CheckCircle2, desc: 'Case has been resolved' },
    ];
    const currentIndex = timeline.findIndex(t => t.label === statusInfo.status);

    const riskLabel = statusInfo.aiLabel || 'review';
    const riskScore = statusInfo.riskScore;
    const basis = statusInfo.classificationBasis || 'pending';
    const riskTone = riskLabel === 'harmful'
        ? 'bg-rose-50 border-rose-200 text-rose-700'
        : riskLabel === 'safe'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700';

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md">
                    <Shield className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-navy-800">Report Tracking</h1>
                    <p className="text-xs text-navy-400 font-mono">{trackingId}</p>
                </div>
            </div>

            {/* Timeline Card */}
            <div className="glass-card p-6 sm:p-8 rounded-2xl shadow-glass">
                <h2 className="text-sm font-bold text-navy-600 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    Status Timeline
                </h2>

                <div className="space-y-0 relative">
                    {timeline.map((step, idx) => {
                        const Icon = step.icon;
                        const isComplete = idx <= currentIndex;
                        const isCurrent = idx === currentIndex;

                        return (
                            <div key={step.label} className="flex gap-4 relative">
                                {/* Connector line */}
                                {idx < timeline.length - 1 && (
                                    <div className="absolute left-[19px] top-10 w-[2px] h-[calc(100%-10px)]">
                                        <div className={`h-full rounded-full transition-all duration-700 ${isComplete ? 'bg-gradient-to-b from-amber-400 to-amber-500' : 'bg-navy-100'}`} />
                                    </div>
                                )}

                                {/* Icon */}
                                <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500
                                    ${isCurrent 
                                        ? 'bg-amber-500 text-navy-900 shadow-glow-amber ring-4 ring-amber-400/30' 
                                        : isComplete 
                                            ? 'bg-emerald-500 text-white shadow-md' 
                                            : 'bg-navy-50 text-navy-300 border border-navy-200'
                                    }`}
                                >
                                    <Icon className="w-5 h-5" />
                                </div>

                                {/* Content */}
                                <div className={`pb-8 pt-1 ${idx === timeline.length - 1 ? 'pb-0' : ''}`}>
                                    <p className={`font-semibold text-sm ${isComplete ? 'text-navy-800' : 'text-navy-300'}`}>
                                        {step.label}
                                        {isComplete && idx <= currentIndex && (
                                            <span className="ml-2 text-emerald-500 text-xs">✓</span>
                                        )}
                                    </p>
                                    <p className={`text-xs mt-0.5 ${isComplete ? 'text-navy-400' : 'text-navy-200'}`}>
                                        {step.desc}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Details */}
                <div className="mt-6 pt-5 border-t border-navy-100 space-y-3">
                    <div className={`rounded-xl border p-4 space-y-2 ${riskTone}`}>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold uppercase tracking-wider text-xs">AI Risk Snapshot</span>
                            <span className="font-bold capitalize">{riskLabel}</span>
                        </div>
                        {typeof riskScore === 'number' && (
                            <div className="text-sm font-medium">
                                Internal score: {riskScore} / 100
                            </div>
                        )}
                        {basis === 'text-only' && (
                            <p className="text-xs opacity-90">
                                This estimate is based on text only (no image evidence was analyzed).
                            </p>
                        )}
                        {basis === 'pending' && (
                            <p className="text-xs opacity-90">
                                Risk estimate is still being processed.
                            </p>
                        )}
                        <p className="text-xs opacity-90">
                            AI risk is preliminary and can be wrong. Final case decision is made by assigned authorities.
                        </p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-navy-400 text-xs font-semibold uppercase tracking-wider">Created</span>
                        <span className="text-navy-700 font-medium">{formatDateTimeOrFallback(statusInfo.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-navy-400 text-xs font-semibold uppercase tracking-wider">Integrity</span>
                        <span className="text-navy-600 font-medium">Tamper-proof logging active</span>
                    </div>

                    <div className="pt-3 flex flex-col sm:flex-row gap-3">
                        <Link href="/track" className="btn-secondary inline-flex items-center justify-center">
                            <ArrowLeft className="mr-2 w-4 h-4" />
                            Return to Tracking Lookup
                        </Link>
                        <Link href="/report" className="btn-primary inline-flex items-center justify-center">
                            Submit New Report
                        </Link>
                        <Link href="/" className="btn-secondary inline-flex items-center justify-center">
                            <Home className="mr-2 w-4 h-4" />
                            Return Home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
