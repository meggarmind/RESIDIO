import { Separator } from '@/components/ui/separator';
import { SettingsSidebar } from '@/components/dashboard/settings/settings-sidebar';
import { SettingsMobileNav } from '@/components/dashboard/settings/settings-mobile-nav';
import { PageTransition } from '@/components/ui/page-transition';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6 p-4 md:p-10 pb-16 block">
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Set up your estate, billing, messages and who can do what.
                </p>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <SettingsMobileNav />
                <SettingsSidebar className="hidden lg:block lg:w-1/5" />
                {/* min-w-0: a wide table must scroll inside its own container, not widen the page (#788). */}
                <div className="min-w-0 flex-1 lg:max-w-4xl" data-testid="settings-content">
                    {/* The root template keeps one key for all of Settings, so only this area animates. */}
                    <PageTransition>{children}</PageTransition>
                </div>
            </div>
        </div>
    );
}
