import { Separator } from '@/components/ui/separator';
import { SettingsSidebar } from '@/components/dashboard/settings/settings-sidebar';
import { SettingsMobileNav } from '@/components/dashboard/settings/settings-mobile-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6 p-4 md:p-10 pb-16 block">
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Manage your estate settings and billing preferences.
                </p>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <SettingsMobileNav />
                <SettingsSidebar className="hidden lg:block lg:w-1/5" />
                <div className="flex-1 lg:max-w-4xl">{children}</div>
            </div>
        </div>
    );
}
