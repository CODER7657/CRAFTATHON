'use client';
import { useState } from 'react';
import { Fingerprint, Loader2, CheckCircle2 } from 'lucide-react';

export default function ZKProofGenerator({ onGenerate }: { onGenerate: (proof: string) => void }) {
    const [state, setState] = useState<'idle' | 'generating' | 'complete'>('idle');

    const handleGenerate = async () => {
        setState('generating');
        await new Promise(resolve => setTimeout(resolve, 2000));
        setState('complete');
        onGenerate('mock-zk-proof-hash-12345');
    };

    return (
        <div className="mt-4">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-md shadow-navy-500/20">
                    <Fingerprint className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                    <h3 className="font-bold text-navy-800 text-sm">Zero-Knowledge Proof</h3>
                    <p className="text-xs text-navy-400">Verify your identity anonymously</p>
                </div>
            </div>
            
            <button 
                onClick={handleGenerate}
                disabled={state !== 'idle'}
                className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2.5
                    ${state === 'idle' 
                        ? 'btn-primary' 
                        : state === 'generating' 
                            ? 'bg-navy-800 text-amber-400 cursor-wait shadow-lg shadow-navy-500/20' 
                            : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    }`}
            >
                {state === 'idle' && (
                    <>
                        <Fingerprint className="w-4 h-4" />
                        Generate Proof & Submit
                    </>
                )}
                {state === 'generating' && (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating ZK Proof...
                    </>
                )}
                {state === 'complete' && (
                    <>
                        <CheckCircle2 className="w-4 h-4" />
                        Proof Generated ✔
                    </>
                )}
            </button>
        </div>
    );
}
