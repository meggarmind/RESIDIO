'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { OpsStatusBanner } from '@/components/dashboard/ops-status-banner';

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // overflow-clip, not overflow-hidden: a hidden box can still be scrolled by scrollIntoView,
    // and a settings page nav click then moved the whole shell up (#1220).
    return (
        <div className="fixed inset-0 flex h-dvh overflow-clip">
            {/* Desktop Sidebar */}
            <Sidebar className="hidden md:flex" />

            {/* Mobile Navigation */}
            <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

            {/* Main Content */}
            <div className="flex flex-1 flex-col transition-all duration-300 ease-in-out overflow-hidden">
                <OpsStatusBanner />
                {/* Header */}
                <Header onMenuClick={() => setMobileNavOpen(true)} />
                {/* relative: absolute descendants such as a `sr-only` live region anchor to the scroller,
                    not to the fixed shell, where they would extend its scrollable overflow (#1220). */}
                <main className="relative min-h-0 flex-1 overflow-y-auto p-4 md:p-6 transition-all duration-300">
                    {children}
                </main>
            </div>
        </div>
    );
}
