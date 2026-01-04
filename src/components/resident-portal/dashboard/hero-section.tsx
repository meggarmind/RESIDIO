'use client';

import { ArrowRight, Shield, FileText, User, Bell } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Announcement } from '@/types/database';

interface HeroSectionProps {
    residentName?: string;
    totalUnpaid: number;
    announcements?: Announcement[];
}

export function HeroSection({ residentName, totalUnpaid, announcements = [] }: HeroSectionProps) {
    const hasUnpaid = totalUnpaid > 0;
    const latestAnnouncement = announcements[0];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[300px]">
            {/* Financial Overview Card - Spans 6 columns */}
            <div className="lg:col-span-6 bg-paier-navy rounded-[24px] p-8 text-white relative flex flex-col justify-between overflow-hidden">
                {/* Header Row */}
                <div className="flex justify-between items-start z-10">
                    <div>
                        <div className="text-gray-400 text-lg mb-1">Welcome back,</div>
                        <div className="text-2xl font-semibold mb-6">{residentName}</div>

                        <div className="text-gray-400 text-sm mb-1 uppercase tracking-wider">Outstanding Balance</div>
                        <div className="text-[56px] font-bold leading-none tracking-tight">
                            {formatCurrency(totalUnpaid)}
                        </div>
                    </div>
                </div>

                {/* Action Footer */}
                <div className="mt-8 flex items-center gap-4 z-10">
                    <Link href="/portal/invoices">
                        <Button
                            className={cn(
                                "rounded-full px-6 h-12 text-sm font-medium transition-all",
                                hasUnpaid
                                    ? "bg-paier-green hover:bg-paier-green/90 text-white"
                                    : "bg-white/10 hover:bg-white/20 text-white"
                            )}
                        >
                            {hasUnpaid ? "Pay Now" : "View History"}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    {hasUnpaid && (
                        <span className="text-paier-coral text-sm font-medium animate-pulse">
                            Action required
                        </span>
                    )}
                </div>

                {/* Background Decoration */}
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                    <svg width="300" height="300" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#4ADE80" d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-4.9C93.5,9.3,82.2,22.9,71.3,34.3C60.4,45.7,49.9,54.9,38.6,62.2C27.3,69.5,15.2,74.9,1.5,72.3C-12.2,69.7,-27.5,59.1,-40.4,49.6C-53.3,40.1,-63.8,31.7,-70.6,20.5C-77.4,9.3,-80.5,-4.7,-77.1,-17.3C-73.7,-29.9,-63.8,-41.1,-52.4,-49C-41,-56.9,-28.1,-61.5,-15.3,-64.5C-2.5,-67.5,10.2,-68.9,22.9,-70.3" transform="translate(100 100)" />
                    </svg>
                </div>
            </div>

            {/* Quick Services - Spans 3 columns */}
            <div className="lg:col-span-3 bg-white rounded-[24px] p-6 border border-gray-100 flex flex-col shadow-sm">
                <h3 className="text-paier-navy font-semibold text-lg mb-6">Quick Actions</h3>

                <div className="space-y-3 flex-1">
                    <QuickAction href="/portal/security-contacts" icon={Shield} label="Security" sub="Manage access" />
                    <QuickAction href="/portal/documents" icon={FileText} label="Documents" sub="View files" />
                    <QuickAction href="/portal/profile" icon={User} label="Profile" sub="Settings" />
                </div>
            </div>

            {/* Latest Announcement - Spans 3 columns */}
            <div className="lg:col-span-3 bg-paier-navy rounded-[24px] p-6 text-white flex flex-col shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-2 mb-6 z-10">
                    <div className="p-2 bg-white/10 rounded-full">
                        <Bell className="h-4 w-4 text-paier-mint" />
                    </div>
                    <span className="font-semibold">Latest Update</span>
                </div>

                <div className="flex-1 flex flex-col z-10">
                    {latestAnnouncement ? (
                        <>
                            <h4 className="text-lg font-bold leading-snug mb-2 line-clamp-3">
                                {latestAnnouncement.title}
                            </h4>
                            <p className="text-gray-400 text-sm line-clamp-4">
                                {latestAnnouncement.content}
                            </p>
                            <div className="mt-auto pt-4">
                                <span className="text-xs text-paier-mint font-medium">
                                    {new Date(latestAnnouncement.created_at || new Date()).toLocaleDateString()}
                                </span>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                            No new announcements
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function QuickAction({ href, icon: Icon, label, sub }: { href: string, icon: any, label: string, sub: string }) {
    return (
        <Link href={href} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-paier-mint/20 transition-colors">
                <Icon className="h-5 w-5 text-gray-500 group-hover:text-paier-navy" />
            </div>
            <div>
                <div className="font-medium text-paier-navy">{label}</div>
                <div className="text-xs text-gray-400">{sub}</div>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-gray-300 group-hover:text-paier-mint" />
        </Link>
    );
}
