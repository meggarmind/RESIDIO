'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
    children: React.ReactNode;
    onRefresh?: () => Promise<void>;
    threshold?: number;
}

export function PullToRefresh({
    children,
    onRefresh,
    threshold = 80
}: PullToRefreshProps) {
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const startY = useRef(0);
    const currentY = useMotionValue(0);
    const controls = useAnimation();

    // Resistance factor - makes it harder to pull the further you go
    const y = useTransform(currentY, [0, threshold * 2], [0, threshold]);
    const rotate = useTransform(currentY, [0, threshold], [0, 180]);
    const opacity = useTransform(currentY, [0, threshold / 2], [0, 1]);

    // Default refresh handler matches Next.js router refresh
    const handleRefresh = async () => {
        if (onRefresh) {
            await onRefresh();
        } else {
            // Default: Trigger Next.js server refresh
            // We wrap in a promise to simulate network delay for better UX if it's too fast
            const refreshPromise = new Promise<void>((resolve) => {
                router.refresh();
                // Give it at least 800ms to show the spinner so it feels like it did something
                setTimeout(resolve, 800);
            });
            await refreshPromise;
        }
    };

    const initTouch = (e: React.TouchEvent) => {
        // Only enable pull to refresh if at top of page
        if (window.scrollY > 0) return;
        startY.current = e.touches[0].clientY;
    };

    const moveTouch = (e: React.TouchEvent) => {
        if (window.scrollY > 0) return;

        // If we're already refreshing, don't interfere
        if (isRefreshing) return;

        const touchY = e.touches[0].clientY;
        const delta = touchY - startY.current;

        // Only allow pulling down
        if (delta > 0) {
            // Prevent default browser behavior (like overscroll bounce on some browsers)
            // Note: passive listeners can't prevent default, but usually scroll logic handles this
            currentY.set(delta);
        }
    };

    const endTouch = async () => {
        if (window.scrollY > 0 && !isRefreshing) return;

        const draggedDistance = currentY.get();

        if (draggedDistance > threshold) {
            setIsRefreshing(true);
            // Snap to threshold
            controls.start({ y: 60 }); // Height of the loader container

            try {
                await handleRefresh();
            } finally {
                setIsRefreshing(false);
                // Reset animations
                controls.start({ y: 0 });
                currentY.set(0);
            }
        } else {
            // Snap back to top if not pulled enough
            controls.start({ y: 0 });
            currentY.set(0);
        }
    };

    // Reset motion value when controls animate back to 0
    useEffect(() => {
        if (!isRefreshing && currentY.get() === 0) {
            controls.set({ y: 0 });
        }
    }, [isRefreshing, currentY, controls]);

    return (
        <div
            className="relative min-h-screen"
            onTouchStart={initTouch}
            onTouchMove={moveTouch}
            onTouchEnd={endTouch}
        >
            {/* Refresh Indicator */}
            <motion.div
                className="absolute left-0 right-0 top-0 flex items-start justify-center overflow-hidden pointer-events-none z-50"
                style={{
                    height: 0, // Should not take up space initially
                    transform: 'translateY(-100%)' // Start hidden
                }}
            >
                <motion.div
                    className="absolute top-0 w-full flex justify-center py-4"
                    style={{ y: useTransform(y, (val) => val > 0 ? val : 0) }}
                >
                    <div className="flex items-center justify-center h-10 w-10 bg-background rounded-full shadow-md border z-50">
                        {isRefreshing ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : (
                            <motion.div style={{ opacity, rotate }}>
                                <ArrowDown className="h-5 w-5 text-primary" />
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            </motion.div>

            {/* Content Container - Moves down when pulled */}
            <motion.div
                style={{ y: isRefreshing ? 60 : y }}
                animate={controls}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
                {children}
            </motion.div>
        </div>
    );
}
