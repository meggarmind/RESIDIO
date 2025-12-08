'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Settings, Book, Shield, CreditCard, Lock, Activity } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const sidebarNavItems = [
    {
        title: 'General',
        href: '/settings',
        icon: Settings,
    },
    {
        title: 'References',
        href: '/settings/references',
        icon: Book,
    },
    {
        title: 'Security',
        href: '/settings/security',
        icon: Shield,
        disabled: true,
    },
    {
        title: 'Payments',
        href: '/settings/payments',
        icon: CreditCard,
        disabled: true,
    },
    {
        title: 'Access Control',
        href: '/settings/access',
        icon: Lock,
        disabled: true,
    },
    {
        title: 'System Logs',
        href: '/settings/logs',
        icon: Activity,
        disabled: true,
    },
];

interface SettingsLayoutProps {
    children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
    const pathname = usePathname();

    return (
        <div className="space-y-6 pb-16">
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Manage your application settings and preferences.
                </p>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <aside className="-mx-4 lg:w-1/5">
                    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
                        {sidebarNavItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.disabled ? '#' : item.href}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted',
                                    pathname === item.href
                                        ? 'bg-muted hover:bg-muted'
                                        : 'hover:bg-transparent hover:underline',
                                    'justify-start',
                                    item.disabled && "opacity-50 cursor-not-allowed pointer-events-none"
                                )}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.title}
                            </Link>
                        ))}
                    </nav>
                </aside>
                <div className="flex-1 lg:max-w-4xl">{children}</div>
            </div>
        </div>
    );
}
