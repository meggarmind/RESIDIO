'use client';

import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '@/components/ui/page-transition';
import { FloatingAiAssistant } from '@/components/assistant/floating-ai-assistant';

export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AnimatePresence mode="wait">
                <PageTransition>{children}</PageTransition>
            </AnimatePresence>
            <FloatingAiAssistant />
        </>
    );
}
