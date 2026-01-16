'use client';

import { QrCode, Share2, Clock, MapPin, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface DigitalPassProps {
    visitorName: string;
    accessCode: string; // e.g., "738-921"
    validUntil: string;
    location: string;
    onShare?: () => void;
    variant?: 'active' | 'expired' | 'upcoming';
}

/**
 * DigitalPassCard
 * 
 * A premium-styled digital pass component resembling a wallet pass.
 * Features:
 * - Holographic/Glassmorphism background
 * - QR Code placeholder
 * - Access details
 */
export function DigitalPassCard({
    visitorName,
    accessCode,
    validUntil,
    location,
    onShare,
    variant = 'active',
}: DigitalPassProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "relative w-full max-w-[320px] mx-auto overflow-hidden rounded-[2rem] shadow-2xl transition-all",
                "bg-gradient-to-br from-gray-900 to-gray-800 text-white", // Dark theme base
                variant === 'expired' && "opacity-60 grayscale",
            )}
        >
            {/* Decorative Gradient Blob */}
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/20 via-purple-500/10 to-transparent blur-3xl pointer-events-none" />

            {/* Header Section */}
            <div className="relative p-6 pb-8 bg-white/5 backdrop-blur-md border-b border-white/10">
                <div className="flex justify-between items-start mb-4">
                    <div className="bg-white/10 p-2 rounded-xl">
                        <MapPin className="h-5 w-5 text-blue-300" />
                    </div>
                    <span className="text-xs font-medium tracking-widest uppercase text-white/50">
                        Visitor Pass
                    </span>
                </div>

                <h3 className="text-2xl font-bold tracking-tight mb-1">{visitorName}</h3>
                <p className="text-sm text-blue-200/80 font-medium">{location}</p>
            </div>

            {/* Cutout Effect (Ticket Notch) */}
            <div className="relative h-4 bg-transparent z-10">
                <div className="absolute left-[-10px] top-[-10px] h-5 w-5 rounded-full bg-background" />
                <div className="absolute right-[-10px] top-[-10px] h-5 w-5 rounded-full bg-background" />
                <div className="absolute top-[-1px] left-2 right-2 border-t-2 border-dashed border-white/20" />
            </div>

            {/* Details Section */}
            <div className="relative p-6 pt-2 space-y-6 bg-white/5 backdrop-blur-md">

                {/* Code Display */}
                <div className="text-center space-y-1">
                    <span className="text-xs text-white/40 uppercase tracking-widest">Access Code</span>
                    <div className="text-4xl font-mono font-bold tracking-widest text-white tracking-widest">
                        {accessCode}
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/60">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-xs">Valid Until</span>
                        </div>
                        <p className="font-semibold text-sm">{validUntil}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/60">
                            <Calendar className="h-3.5 w-3.5" />
                            <span className="text-xs">Date</span>
                        </div>
                        <p className="font-semibold text-sm">Today</p>
                    </div>
                </div>

                {/* QR Placeholder */}
                <div className="flex justify-center py-2">
                    <div className="bg-white p-2 rounded-xl">
                        <QrCode className="h-24 w-24 text-black" />
                    </div>
                </div>

                {/* Share Button */}
                {onShare && (
                    <Button
                        onClick={onShare}
                        className="w-full rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold h-12 shadow-lg shadow-blue-500/20"
                    >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share Pass
                    </Button>
                )}
            </div>
        </motion.div>
    );
}
