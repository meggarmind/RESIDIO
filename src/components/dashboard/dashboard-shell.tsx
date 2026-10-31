'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { OpsStatusBanner } from '@/components/dashboard/ops-status-banner';

// useSearchParams opts its component out of prerendering up to the nearest Suspense boundary. The menus
// need the query only to mark a ?tab= child active (#1373), so each is rendered once without it as the
// fallback (prerender and first paint keep the full menu) and again with it inside the boundary.
function SidebarWithParams({ className }: { className?: string }) {
    return <Sidebar className={className} searchParams={useSearchParams()} />;
}

function MobileNavWithParams(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return <MobileNav {...props} searchParams={useSearchParams()} />;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // overflow-clip, not overflow-hidden: a hidden box can still be scrolled by scrollIntoView,
    // and a settings page nav click then moved the whole shell up (#1220).
    return (
        <div className="fixed inset-0 flex h-dvh overflow-clip">
            {/* Desktop Sidebar */}
            <Suspense fallback={<Sidebar className="hidden md:flex" />}>
                <SidebarWithParams className="hidden md:flex" />
            </Suspense>

            {/* Mobile Navigation */}
            <Suspense fallback={<MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />}>
                <MobileNavWithParams open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
            </Suspense>

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
