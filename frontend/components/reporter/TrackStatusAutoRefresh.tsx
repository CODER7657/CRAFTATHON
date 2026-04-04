'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polls the server-rendered track page while AI scoring is likely still in flight.
 */
export function TrackStatusAutoRefresh({
    trackingId,
    enabled,
}: {
    trackingId: string;
    enabled: boolean;
}) {
    const router = useRouter();
    const attempts = useRef(0);

    useEffect(() => {
        attempts.current = 0;
        if (!enabled) return undefined;

        const maxAttempts = 40;
        const intervalMs = 2500;

        const id = setInterval(() => {
            attempts.current += 1;
            router.refresh();
            if (attempts.current >= maxAttempts) {
                clearInterval(id);
            }
        }, intervalMs);

        return () => clearInterval(id);
    }, [enabled, router, trackingId]);

    return null;
}
