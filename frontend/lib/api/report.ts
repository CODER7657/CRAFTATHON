export type ReportStatusResult = {
    status: 'Submitted' | 'AI Review' | 'Authority Assigned' | 'Resolved';
    trackingId: string;
    createdAt: string;
    updatedAt: string;
    txHash?: string;
    riskScore?: number;
    aiLabel?: 'safe' | 'review' | 'harmful';
    classificationBasis?: 'text-only' | 'text-and-image' | 'pending';
};

export type SubmitReportParams = {
    url: string;
    description: string;
    jurisdictionCode: string;
    file: File | null;
    proof: string;
};

function getApiBaseUrl(): string {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) {
        throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured');
    }
    return base.replace(/\/$/, '');
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}

async function fileToBase64(file: File): Promise<string> {
    const arr = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < arr.length; i += 1) {
        binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
}

function mapBackendStatus(status: string): ReportStatusResult['status'] {
    if (status === 'resolved') {
        return 'Resolved';
    }
    if (status === 'assigned' || status === 'flagged') {
        return 'Authority Assigned';
    }
    if (status === 'submitted') {
        return 'Submitted';
    }
    return 'AI Review';
}

export async function submitReport(params: SubmitReportParams): Promise<string> {
    const isMockMode = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000';

    if (isMockMode || !process.env.NEXT_PUBLIC_API_BASE_URL) {
        return `mock-track-${Date.now()}`;
    }

    const apiBase = getApiBaseUrl();
    const now = Date.now();
    const reportHash = await sha256Hex(`${now}:${params.description}:${params.url || ''}`);
    const zkSalt = process.env.NEXT_PUBLIC_ZK_VERIFIER_SALT?.trim();
    if (!zkSalt) {
        throw new Error('Missing NEXT_PUBLIC_ZK_VERIFIER_SALT in frontend env. Set it and restart Next.js.');
    }
    const zkProofHash = await sha256Hex(`${reportHash}:${zkSalt}`);

    const payload = {
        incident_text: params.description,
        jurisdiction_code: params.jurisdictionCode,
        source_url: params.url?.trim() ? params.url : null,
        image_cid: null,
        report_hash: reportHash,
        zk_proof_hash: zkProofHash,
        metadata: {
            source: 'frontend',
            has_file: !!params.file,
        },
    };

    const response = await fetch(`${apiBase}/api/report/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        let message = 'Failed to submit report';
        try {
            const errJson = await response.json();
            message =
                errJson?.message ||
                errJson?.detail ||
                errJson?.error?.message ||
                message;
            if (Array.isArray(errJson?.detail)) {
                message = errJson.detail.map((d: any) => d?.msg).filter(Boolean).join(', ') || message;
            }
        } catch {
            // Keep generic message when response body is not JSON.
        }
        throw new Error(message);
    }

    const resJson = await response.json();
    const trackingId = resJson.data?.tracking_id || resJson.tracking_id || resJson.trackingId;
    if (!trackingId) {
        throw new Error('Backend did not return tracking_id');
    }

    // Trigger async classification with complainant-provided image when available.
    if (params.file) {
        try {
            const imageBase64 = await fileToBase64(params.file);
            await fetch(`${apiBase}/api/ai/classify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tracking_id: trackingId,
                    image_base64: imageBase64,
                    image_content_type: params.file.type || 'application/octet-stream',
                }),
            });
        } catch (e) {
            // Report submission should not fail if classify trigger fails.
            console.warn('Classification trigger failed:', e);
        }
    }

    return trackingId;
}

export async function getReportStatus(trackingId: string): Promise<ReportStatusResult> {
    const isMockMode = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000';  

    if (isMockMode || !process.env.NEXT_PUBLIC_API_BASE_URL) {
        return {
            status: 'AI Review',
            trackingId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            txHash: '0xabc123mocktxhash',
            riskScore: 62,
            aiLabel: 'review',
            classificationBasis: 'text-only',
        };
    }

    const response = await fetch(`${getApiBaseUrl()}/api/report/status/${trackingId}`, {
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error('Status not found');
    }

    const json = await response.json();
    const data = json.data || json;
    const createdAt = data.created_at || data.submitted_at || data.last_updated_at || new Date().toISOString();
    const updatedAt = data.last_updated_at || createdAt;
    const imageMode = data.confidence_explanation?.image?.mode as string | undefined;
    const classificationBasis: ReportStatusResult['classificationBasis'] =
        imageMode === 'none' ? 'text-only' : imageMode ? 'text-and-image' : 'pending';

    return {
        status: mapBackendStatus(data.status || 'review'),
        trackingId: data.tracking_id || trackingId,
        createdAt,
        updatedAt,
        txHash: data.onchain_tx_hash || undefined,
        riskScore: typeof data.risk_score === 'number' ? data.risk_score : undefined,
        aiLabel: data.ai_label || undefined,
        classificationBasis,
    };
}