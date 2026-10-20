'use client';

import { AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { PageTransition } from '@/components/ui/page-transition';

export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // One key for all of Settings, so moving between its pages does not remount
    // the settings layout and sidebar; that layout animates its content area instead (#786).
    const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');

    return (
        <AnimatePresence mode="wait">
            <PageTransition transitionKey={isSettings ? '/settings' : pathname}>{children}</PageTransition>
        </AnimatePresence>
    );
}
