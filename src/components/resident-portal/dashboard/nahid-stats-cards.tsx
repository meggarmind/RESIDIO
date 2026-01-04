'use client';

import { CreditCard, User, Layers, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, formatCurrency } from '@/lib/utils';
import { AnimatedCounter } from '@/components/ui/animated-counter';

// Spring physics for professional, subtle animations
const spring = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
    mass: 1,
};

// Helper for animated mini bar charts
function MiniBarChart({ colors }: { colors: string[] }) {
    const barHeights = [40, 70, 45, 90, 60, 80, 50];

    return (
        <div className="flex items-end gap-1 h-8">
            {barHeights.map((height, i) => (
                <motion.div
                    key={i}
                    className={cn("w-2 rounded-t-sm origin-bottom", colors[i % colors.length])}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{
                        ...spring,
                        delay: i * 0.05, // 50ms stagger between bars
                    }}
                    style={{ height: `${height}%` }}
                />
            ))}
        </div>
    );
}

interface NahidStatsCardsProps {
    walletBalance: number;
    propertyCount: number;
    securityContactsCount: number;
    onTopUpClick?: () => void;
    onViewPropertiesClick?: () => void;
    onAddVisitorClick?: () => void;
}

// Card variants for stagger animation
const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (custom: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            ...spring,
            delay: custom * 0.1, // 100ms stagger between cards
        },
    }),
};

export function NahidStatsCards({
    walletBalance,
    propertyCount,
    securityContactsCount,
    onTopUpClick,
    onViewPropertiesClick,
    onAddVisitorClick,
}: NahidStatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Wallet Balance (Total Revenue style) */}
            <motion.div
                className="bg-bill-card border border-border rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-200"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                custom={0}
            >
                <div className="mb-4">
                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-bill-secondary mb-3">
                        <CreditCard className="h-5 w-5 text-bill-text" />
                    </div>
                    <p className="text-sm font-medium text-bill-text-secondary">Wallet Balance</p>
                    <h3 className="text-[32px] font-bold text-bill-text leading-tight mt-1">
                        <AnimatedCounter
                            value={walletBalance}
                            formatter={formatCurrency}
                        />
                    </h3>
                </div>

                <div className="flex items-end justify-between">
                    <MiniBarChart colors={['bg-bill-mint', 'bg-bill-lavender']} />
                    <button
                        onClick={onTopUpClick}
                        className="flex items-center gap-1 bg-[#111827] dark:bg-[#374151] text-white px-2 py-1 rounded-full text-[11px] font-medium hover:bg-[#1f2937] dark:hover:bg-[#4b5563] transition-colors cursor-pointer"
                    >
                        <Copy className="h-3 w-3" />
                        <span>Top Up</span>
                    </button>
                </div>
            </motion.div>

            {/* Card 2: Properties (New Subscriptions style - Featured/Dark) */}
            <motion.div
                className="bg-[#111827] border-2 border-bill-success rounded-2xl p-5 shadow-lg hover:-translate-y-0.5 transition-transform duration-200"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                custom={1}
            >
                <div className="mb-4">
                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10 mb-3">
                        <User className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm font-medium text-white/70">Active Properties</p>
                    <h3 className="text-[32px] font-bold text-white leading-tight mt-1">
                        <AnimatedCounter value={propertyCount} />
                    </h3>
                </div>

                <div className="flex items-end justify-between">
                    <MiniBarChart colors={['bg-bill-mint', 'bg-bill-coral', 'bg-bill-lavender']} />
                    <button
                        onClick={onViewPropertiesClick}
                        className="flex items-center gap-1 bg-white text-[#111827] px-2 py-1 rounded-full text-[11px] font-medium hover:bg-white/90 transition-colors cursor-pointer"
                    >
                        <span>View All</span>
                    </button>
                </div>
            </motion.div>

            {/* Card 3: Security Contacts (Renewal Revenue style) */}
            <motion.div
                className="bg-bill-card border border-border rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-200"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                custom={2}
            >
                <div className="mb-4">
                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-bill-secondary mb-3">
                        <Layers className="h-5 w-5 text-bill-text" />
                    </div>
                    <p className="text-sm font-medium text-bill-text-secondary">Visitors</p>
                    <h3 className="text-[32px] font-bold text-bill-text leading-tight mt-1">
                        <AnimatedCounter value={securityContactsCount} />
                    </h3>
                </div>

                <div className="flex items-end justify-between">
                    <MiniBarChart colors={['bg-bill-mint', 'bg-bill-lavender']} />
                    <button
                        onClick={onAddVisitorClick}
                        className="flex items-center gap-1 bg-[#111827] dark:bg-[#374151] text-white px-2 py-1 rounded-full text-[11px] font-medium hover:bg-[#1f2937] dark:hover:bg-[#4b5563] transition-colors cursor-pointer"
                    >
                        <span>+ Add</span>
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
