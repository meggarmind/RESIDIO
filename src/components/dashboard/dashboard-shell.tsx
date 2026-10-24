'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { OpsStatusBanner } from '@/components/dashboard/ops-status-banner';

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    return (
        <div className="fixed inset-0 flex h-dvh overflow-hidden">
            {/* Desktop Sidebar */}
            <Sidebar className="hidden md:flex" />

            {/* Mobile Navigation */}
            <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

            {/* Main Content */}
            <div className="flex flex-1 flex-col transition-all duration-300 ease-in-out overflow-hidden">
                <OpsStatusBanner />
                {/* Header */}
                <Header onMenuClick={() => setMobileNavOpen(true)} />
                <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 transition-all duration-300">
                    {children}
                </main>
            </div>
        </div>
    );
}
