'use client';

import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '@/components/ui/page-transition';

export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <AnimatePresence mode="wait">
            <PageTransition>{children}</PageTransition>
        </AnimatePresence>
    );
}
