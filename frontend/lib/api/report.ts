import { getPublicApiBaseUrl } from '@/lib/backend-url';

export type ReportStatusResult = {
    status: 'Submitted' | 'AI Review' | 'Authority Assigned' | 'Resolved';
    trackingId: string;
    createdAt: string;
    updatedAt: string;
    txHash?: string;
    riskScore?: number;
    aiLabel?: 'safe' | 'review' | 'harmful';
    classificationBasis?: 'text-only' | 'text-and-image' | 'pending' | 'failed' | 'incomplete';
};

export type SubmitReportParams = {
    url: string;
    description: string;
    jurisdictionCode: string;
    file: File | null;
    proof: string;
};

function getApiBaseUrl(): string {
    return getPublicApiBaseUrl();
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

    const response = await fetch(`${apiBase}/report/submit`, {
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
    let submitData = resJson.data ?? resJson;
    if (
        submitData &&
        typeof submitData === 'object' &&
        'data' in submitData &&
        submitData.data &&
        typeof submitData.data === 'object' &&
        'tracking_id' in (submitData.data as object)
    ) {
        submitData = submitData.data as typeof submitData;
    }
    const trackingId =
        (submitData as { tracking_id?: string })?.tracking_id ||
        resJson.tracking_id ||
        resJson.trackingId;
    if (!trackingId) {
        throw new Error('Backend did not return tracking_id');
    }

    // Run classification in the API process (sync) so scores exist before the user opens the track page.
    // Celery-only flows often leave risk_score at 0 when no worker is running.
    let imageBase64: string | null = null;
    let imageContentType: string | null = null;
    if (params.file) {
        try {
            imageBase64 = await fileToBase64(params.file);
            imageContentType = params.file.type || 'application/octet-stream';
        } catch (e) {
            console.warn('Could not read file for classification:', e);
        }
    }

    const controller = new AbortController();
    const classifyTimeout = setTimeout(() => controller.abort(), 120_000);
    try {
            const classifyRes = await fetch(`${apiBase}/ai/classify?sync=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tracking_id: trackingId,
                image_base64: imageBase64,
                image_content_type: imageContentType,
            }),
            signal: controller.signal,
        });
        if (!classifyRes.ok) {
            console.warn('Sync classification returned', classifyRes.status);
        }
    } catch (e) {
        console.warn('Sync classification failed:', e);
    } finally {
        clearTimeout(classifyTimeout);
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

    const response = await fetch(`${getApiBaseUrl()}/report/status/${trackingId}`, {
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error('Status not found');
    }

    const json = await response.json();
    let data = json.data ?? json;
    if (
        data &&
        typeof data === 'object' &&
        'data' in data &&
        data.data &&
        typeof data.data === 'object' &&
        'tracking_id' in (data.data as object)
    ) {
        data = data.data as typeof data;
    }
    const createdAt = data.created_at || data.submitted_at || data.last_updated_at || new Date().toISOString();
    const updatedAt = data.last_updated_at || createdAt;

    let expl = data.confidence_explanation as Record<string, unknown> | string | null | undefined;
    if (typeof expl === 'string') {
        try {
            expl = JSON.parse(expl) as Record<string, unknown>;
        } catch {
            expl = undefined;
        }
    }

    const rawStatus = (typeof data.status === 'string' ? data.status : '').toLowerCase();
    const imageBlock = expl?.image;
    const textBlock = expl?.text;
    const imageMode =
        imageBlock && typeof imageBlock === 'object' && imageBlock !== null
            ? String((imageBlock as { mode?: unknown }).mode ?? '')
            : '';
    const textMode =
        textBlock && typeof textBlock === 'object' && textBlock !== null
            ? String((textBlock as { mode?: unknown }).mode ?? '')
            : '';

    let classificationBasis: ReportStatusResult['classificationBasis'] = 'pending';
    if (expl && typeof expl.error === 'string') {
        classificationBasis = 'failed';
    } else if (imageMode === 'none') {
        classificationBasis = 'text-only';
    } else if (imageMode) {
        classificationBasis = 'text-and-image';
    } else if (textMode) {
        classificationBasis = 'text-only';
    } else if (['review', 'flagged', 'assigned', 'resolved'].includes(rawStatus)) {
        classificationBasis = 'incomplete';
    }

    const rs = data.risk_score;
    let riskScore: number | undefined;
    if (typeof rs === 'number' && !Number.isNaN(rs)) {
        riskScore = rs;
    } else if (typeof rs === 'string' && rs.trim() !== '' && !Number.isNaN(Number(rs))) {
        riskScore = Number(rs);
    }

    return {
        status: mapBackendStatus(data.status || 'review'),
        trackingId: data.tracking_id || trackingId,
        createdAt,
        updatedAt,
        txHash: data.onchain_tx_hash || undefined,
        riskScore,
        aiLabel: data.ai_label || undefined,
        classificationBasis,
    };
}