'use client';

import { useState, useEffect } from 'react';

export type OS = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'other';

export function useOS(): OS {
    const [os, setOs] = useState<OS>('other');

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const userAgent = window.navigator.userAgent.toLowerCase();
        const platform = window.navigator.platform.toLowerCase();

        if (platform.includes('mac') || userAgent.includes('mac')) {
            setOs('mac');
        } else if (platform.includes('win') || userAgent.includes('win')) {
            setOs('windows');
        } else if (platform.includes('linux') || userAgent.includes('linux')) {
            setOs('linux');
        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
            setOs('ios');
        } else if (userAgent.includes('android')) {
            setOs('android');
        } else {
            setOs('other');
        }
    }, []);

    return os;
}
