import { Separator } from '@/components/ui/separator';
import { SettingsSidebar } from '@/components/dashboard/settings/settings-sidebar';
import { SettingsMobileNav } from '@/components/dashboard/settings/settings-mobile-nav';
import { PageTransition } from '@/components/ui/page-transition';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6 p-4 md:p-10 pb-16 block">
            <div className="space-y-0.5">
                {/* A label, not a heading: each page's own title is the h1. */}
                <p className="text-2xl font-bold tracking-tight">Settings</p>
                <p className="text-muted-foreground">
                    Set up your estate, billing, messages and who can do what.
                </p>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <SettingsMobileNav />
                {/* lg:flex, not lg:block: the sidebar is a flex column so its nav can scroll (#1012). */}
                <SettingsSidebar className="hidden lg:flex lg:w-56 xl:w-64 lg:shrink-0" />
                {/* min-w-0: a wide table must scroll inside its own container, not widen the page (#788). */}
                <div className="min-w-0 flex-1 lg:max-w-4xl" data-testid="settings-content">
                    {/* The root template keeps one key for all of Settings, so only this area animates. */}
                    <PageTransition>{children}</PageTransition>
                </div>
            </div>
        </div>
    );
}
