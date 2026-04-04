'use client';

import { useState } from 'react';
import ZKProofGenerator from '@/components/reporter/ZKProofGenerator';
import EncryptionLayer from '@/components/reporter/EncryptionLayer';
import { submitReport } from '@/lib/api/report';
import { INDIA_STATES } from '@/lib/indiaLocation';
import { getReportJurisdictionCode, isReportJurisdictionOverrideActive } from '@/lib/reportJurisdiction';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, UploadCloud, FileType, CheckCircle, ArrowRight, ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';

export default function ReportPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [url, setUrl] = useState('');
    const [stateCode, setStateCode] = useState('');
    const [cityOrDistrict, setCityOrDistrict] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const handleNext = () => setStep(s => s + 1);
    const handlePrev = () => setStep(s => s - 1);

    const computedJurisdictionCode = getReportJurisdictionCode(stateCode, cityOrDistrict);
    const jurisdictionOverride = isReportJurisdictionOverrideActive();
    const selectedState = INDIA_STATES.find((s) => s.code === stateCode);

    const handleSubmit = async (proof: string) => {
        setIsSubmitting(true);
        setError('');
        try {
            const trackingId = await submitReport({
                url,
                description,
                jurisdictionCode: computedJurisdictionCode,
                file,
                proof,
            });
            router.push(`/track/${trackingId}`);
        } catch (err: any) {
            setError(err.message || 'Submission failed');
            setIsSubmitting(false);
        }
    };

    const steps = [
        { title: 'Incident Details', desc: 'Tell us what happened', icon: '📝' },
        { title: 'Evidence', desc: 'Upload files safely', icon: '📎' },
        { title: 'Verify & Submit', desc: 'Confirm via ZK Proof', icon: '🔐' }
    ];

    return (
        <div className="max-w-4xl mx-auto py-6 px-4 sm:px-0">
            <div className="glass-card rounded-3xl overflow-hidden min-h-[600px] flex flex-col shadow-glass-lg">
                
                {/* Header & Progress Indicator */}
                <div className="relative bg-gradient-header px-6 sm:px-10 py-8 text-white overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 opacity-[0.06] -mr-4 -mt-4">
                        <Shield size={160} />
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1 relative z-10">
                        Submit Anonymous Report
                    </h1>
                    <p className="text-navy-300 max-w-lg relative z-10 text-sm sm:text-base">
                        Your identity is cryptographically protected. Be as detailed as possible to help authorities take action.
                    </p>
                    <p className="mt-3 text-xs text-navy-300 relative z-10">
                        Already submitted?{' '}
                        <Link href="/track" className="text-amber-300 hover:text-amber-200 font-semibold underline underline-offset-2">
                            Check status using tracking ID
                        </Link>
                    </p>

                    {/* Steps */}
                    <div className="mt-8 flex items-start justify-between relative z-10 hidden sm:flex">
                        {steps.map((s, i) => (
                            <div key={i} className="flex flex-col items-center w-1/3 relative">
                                {/* Connector line */}
                                {i !== 2 && (
                                    <div className="absolute top-5 left-[calc(50%+20px)] h-[2px] right-[calc(-50%+20px)]">
                                        <div className={`h-full transition-all duration-700 ${step > i + 1 ? 'bg-amber-400' : 'bg-navy-700'}`} />
                                    </div>
                                )}
                                
                                <div className={`relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-2.5 transition-all duration-500 z-10
                                    ${step > i + 1 
                                        ? 'bg-amber-500 text-navy-900 shadow-glow-amber' 
                                        : step === i + 1 
                                            ? 'bg-white text-navy-800 ring-4 ring-amber-400/40 shadow-lg' 
                                            : 'bg-navy-800 text-navy-500 border border-navy-700'
                                    }`}
                                >
                                    {step > i + 1 ? <CheckCircle size={18} /> : <span>{s.icon}</span>}
                                </div>
                                <span className={`text-sm font-semibold transition-colors ${step === i + 1 ? 'text-white' : 'text-navy-400'}`}>
                                    {s.title}
                                </span>
                                <span className="text-xs text-navy-500 mt-0.5">{s.desc}</span>
                            </div>
                        ))}
                    </div>

                    {/* Mobile step indicator */}
                    <div className="mt-6 sm:hidden flex items-center gap-3">
                        {steps.map((_, i) => (
                            <div key={i} className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${step > i ? 'bg-amber-400' : 'bg-navy-700'}`} />
                        ))}
                    </div>
                </div>

                {/* Form Body */}
                <div className="flex-1 p-6 sm:p-10 relative bg-mesh">
                    {error && (
                        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 font-medium rounded-xl flex items-center gap-3 animate-fade-in">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-500" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Step 1: Details */}
                    {step === 1 && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="block text-sm font-semibold text-navy-700 mb-2">
                                    State <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    suppressHydrationWarning
                                    value={stateCode}
                                    onChange={e => setStateCode(e.target.value)}
                                    className="input-modern"
                                >
                                    <option value="">Select a state</option>
                                    {INDIA_STATES.map((state) => (
                                        <option key={state.code} value={state.code}>
                                            {state.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-navy-700 mb-2">
                                    City or District <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Example: New Delhi"
                                    value={cityOrDistrict}
                                    onChange={e => setCityOrDistrict(e.target.value)}
                                    className="input-modern"
                                />
                                <p className="mt-1 text-xs text-navy-400">
                                    Enter any valid city or district in India. Suggestions below are optional and not exhaustive.
                                </p>
                                {!!selectedState && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedState.suggestedCities.map((city) => (
                                            <button
                                                key={city}
                                                type="button"
                                                onClick={() => setCityOrDistrict(city)}
                                                className="px-3 py-1 rounded-full border border-navy-200 bg-white text-xs font-medium text-navy-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
                                            >
                                                {city}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-navy-700 mb-2">Generated Jurisdiction Code</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={computedJurisdictionCode || 'IN-STATE-CITY'}
                                    className="input-modern bg-navy-50"
                                />
                                <p className="mt-1 text-xs text-navy-400">
                                    {jurisdictionOverride ? (
                                        <>
                                            Demo routing: every report uses the configured override so it appears in the
                                            matching authority dashboard (e.g. MOCK-JURISDICTION).
                                        </>
                                    ) : (
                                        <>
                                            Generated as IN-STATE-CITY. Only authorities for this exact code see the case
                                            in their portal—use the same jurisdiction as your officer account, or set{' '}
                                            <code className="text-[10px] bg-navy-100 px-1 rounded">NEXT_PUBLIC_REPORT_JURISDICTION_OVERRIDE</code>{' '}
                                            for demo installs.
                                        </>
                                    )}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-navy-700 mb-2">
                                    Involved URL <span className="text-navy-400 font-normal">(Optional)</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-navy-300">
                                        🔗
                                    </span>
                                    <input 
                                        type="url" 
                                        placeholder="https://example.com/..." 
                                        value={url} 
                                        onChange={e => setUrl(e.target.value)} 
                                        className="input-modern pl-11" 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-navy-700 mb-2">
                                    Incident Description <span className="text-rose-500">*</span>
                                </label>
                                <textarea 
                                    placeholder="Please describe what you observed in detail..."
                                    value={description} 
                                    onChange={e => setDescription(e.target.value)} 
                                    className="input-modern resize-none min-h-[180px]" 
                                />
                            </div>
                            <div className="pt-2 flex justify-end">
                                <button 
                                    onClick={handleNext} 
                                    disabled={!computedJurisdictionCode || !description.trim()} 
                                    className="btn-primary"
                                >
                                    Continue <ArrowRight className="ml-2 w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Evidence */}
                    {step === 2 && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="text-center mb-6">
                                <h2 className="text-xl sm:text-2xl font-bold text-navy-800">Support your report</h2>
                                <p className="text-navy-400 mt-1 text-sm">Upload screenshots, documents, or media. End-to-end encrypted before leaving your device.</p>
                            </div>
                            
                            <div 
                                className={`relative border-2 border-dashed rounded-2xl p-10 sm:p-14 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group
                                    ${isDragging 
                                        ? 'border-amber-400 bg-amber-50/50 shadow-glow-amber' 
                                        : file 
                                            ? 'border-emerald-300 bg-emerald-50/30' 
                                            : 'border-navy-200 bg-white/60 hover:border-amber-300 hover:bg-amber-50/20'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                        setFile(e.dataTransfer.files[0]);
                                    }
                                }}
                                onClick={() => document.getElementById('fileUpload')?.click()}
                            >
                                <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" id="fileUpload" />
                                
                                {file ? (
                                    <div className="flex flex-col items-center animate-fade-in">
                                        <div className="w-16 h-16 bg-emerald-100 border border-emerald-200 rounded-2xl flex items-center justify-center mb-4 text-emerald-600 shadow-md">
                                            <FileType size={28} />
                                        </div>
                                        <p className="font-bold text-navy-800 text-lg mb-0.5">{file.name}</p>
                                        <p className="text-sm text-navy-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        <p className="mt-4 px-4 py-2 border border-navy-200 rounded-full text-amber-600 text-xs font-semibold hover:bg-amber-50 transition-colors">
                                            Click to replace file
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <div className="w-16 h-16 bg-navy-50 border border-navy-200 rounded-2xl flex items-center justify-center mb-4 text-navy-400 group-hover:text-amber-500 group-hover:bg-amber-50 group-hover:border-amber-200 transition-all duration-300 shadow-sm">
                                            <UploadCloud size={28} />
                                        </div>
                                        <p className="font-bold text-navy-800 text-lg mb-0.5">Drag & drop your file here</p>
                                        <p className="text-sm text-navy-400">or click to browse from your device</p>
                                        <p className="text-xs text-navy-300 mt-4">Max file size 50MB</p>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-between">
                                <button onClick={handlePrev} className="btn-secondary">
                                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                                </button>
                                <button onClick={handleNext} className="btn-primary">
                                    Continue <ArrowRight className="ml-2 w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Review */}
                    {step === 3 && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Review Summary Card */}
                            <div className="glass-card p-6 rounded-2xl">
                                <h3 className="text-lg font-bold text-navy-800 mb-5 pb-3 border-b border-navy-100 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                                    Review Summary
                                </h3>
                                <dl className="space-y-5">
                                    {url && (
                                        <div>
                                            <dt className="text-[10px] font-bold text-navy-400 uppercase tracking-[0.12em]">Involved URL</dt>
                                            <dd className="mt-1 text-navy-700 text-sm font-medium break-all">{url}</dd>
                                        </div>
                                    )}
                                    <div>
                                        <dt className="text-[10px] font-bold text-navy-400 uppercase tracking-[0.12em]">Jurisdiction Code</dt>
                                        <dd className="mt-1 text-navy-700 text-sm font-medium break-all">{computedJurisdictionCode}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-bold text-navy-400 uppercase tracking-[0.12em]">Description</dt>
                                        <dd className="mt-1 text-navy-700 text-sm whitespace-pre-wrap leading-relaxed">{description}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-bold text-navy-400 uppercase tracking-[0.12em]">Attached File</dt>
                                        <dd className="mt-1 flex items-center text-sm font-medium text-navy-700">
                                            {file ? (
                                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-navy-50 rounded-lg border border-navy-100">
                                                    <FileType className="w-4 h-4 text-amber-500" />{file.name}
                                                </span>
                                            ) : (
                                                <span className="text-navy-300 italic">No file attached</span>
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                            
                            <EncryptionLayer>
                                <ZKProofGenerator onGenerate={handleSubmit} />
                                {isSubmitting && (
                                    <div className="mt-4 p-4 bg-gradient-to-r from-navy-800 to-navy-900 text-amber-400 rounded-xl flex flex-col items-center justify-center gap-2 animate-pulse font-semibold text-sm shadow-lg text-center">
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                                            <span>Submitting report and running automated risk analysis…</span>
                                        </div>
                                        <span className="text-xs text-navy-300 font-normal max-w-md">
                                            This can take up to a minute while the AI reviews your report.
                                        </span>
                                    </div>
                                )}
                            </EncryptionLayer>

                            <div className="pt-2 flex justify-start">
                                <button 
                                    onClick={handlePrev} 
                                    disabled={isSubmitting} 
                                    className="btn-secondary disabled:opacity-50"
                                >
                                    <ArrowLeft className="mr-2 w-4 h-4" /> Back to Edit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}