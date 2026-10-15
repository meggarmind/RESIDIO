'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { isSharedTransitionActive } from '@/lib/navigation/shared-element-transition';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

const variants = {
    hidden: { opacity: 0, y: 10 },
    enter: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
};

export function PageTransition({ children, className }: PageTransitionProps) {
    const pathname = usePathname();
    // During a shared-element transition the new page must be fully visible in
    // the view-transition's new snapshot, so skip the opacity/y enter.
    const skipEnter = isSharedTransitionActive();

    return (
        <motion.div
            key={pathname}
            initial={skipEnter ? false : 'hidden'}
            animate="enter"
            exit="exit"
            variants={variants}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
