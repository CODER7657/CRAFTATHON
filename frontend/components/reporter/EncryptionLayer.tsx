'use client';
import { Lock } from 'lucide-react';

export default function EncryptionLayer({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative mt-4">
            {/* Gradient border container */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 opacity-30" />
            <div className="relative glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3 text-emerald-700">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider">End-to-End Encrypted Context</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
                </div>
                {children}
            </div>
        </div>
    );
}
