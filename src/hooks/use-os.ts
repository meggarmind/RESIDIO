'use client';

import { useMemo } from 'react';

export type OS = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'other';

function detectOS(): OS {
    if (typeof window === 'undefined') return 'other';
    const ua = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform.toLowerCase();

    if (platform.includes('mac') || ua.includes('mac')) return 'mac';
    if (platform.includes('win') || ua.includes('win')) return 'windows';
    if (platform.includes('linux') || ua.includes('linux')) return 'linux';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    if (ua.includes('android')) return 'android';
    return 'other';
}

export function useOS(): OS {
    return useMemo(() => detectOS(), []);
}
