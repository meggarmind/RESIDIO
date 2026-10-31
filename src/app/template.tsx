'use client';

import { AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { PageTransition } from '@/components/ui/page-transition';

/** Settings, then the Oversight route group `(dashboard)/(oversight)`. /reports itself is its own page (#1373). */
const AREAS = ['/settings', '/system', '/analytics', '/reports/financial-overview'];

export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // One key for all of Settings, and one for all of Oversight, so moving between their pages does not
    // remount the layout and its left menu; each layout animates its content area instead (#786, #1357).
    const area = AREAS.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const key = area ? (area === '/settings' ? '/settings' : 'oversight') : pathname;

    return (
        <AnimatePresence mode="wait">
            <PageTransition transitionKey={key}>{children}</PageTransition>
        </AnimatePresence>
    );
}
