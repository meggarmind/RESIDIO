import { Separator } from '@/components/ui/separator';
import { PageTransition } from '@/components/ui/page-transition';
import { OversightMobileNav, OversightSidebar } from './oversight-nav';

/**
 * The layout of the `(oversight)` route group (/system, /analytics, /reports/financial-overview): Oversight's left menu around the
 * page (#1272). One layout for all of them, as Settings has one, so the menu stays mounted between pages (#1357).
 */
export function OversightLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6 p-4 md:p-10 pb-16 block">
            <div className="space-y-0.5">
                {/* A label, not a heading: each page's own title is the h1. */}
                <p className="text-2xl font-bold tracking-tight">Oversight</p>
                <p className="text-muted-foreground">Reports, message activity and the health of the system.</p>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <OversightMobileNav />
                <OversightSidebar className="hidden lg:block lg:w-56 xl:w-64 lg:shrink-0" />
                <div className="min-w-0 flex-1" data-testid="oversight-content">
                    <PageTransition>{children}</PageTransition>
                </div>
            </div>
        </div>
    );
}
