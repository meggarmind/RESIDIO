'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { useFitToMain } from '@/hooks/use-fit-to-main';
import { oversightConfig } from '@/config/oversight-nav';
import { activeSettingsHref, settingsPageLabel, type SettingsGroup } from '@/config/settings-nav';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

/**
 * The entries the reader can open, grouped. While permissions load every entry shows,
 * so the menu does not flash empty (same rule as `useSettingsNavigation`).
 */
function useOversightGroups(): SettingsGroup[] {
    const { isLoading, hasAnyPermission } = useAuth();
    return React.useMemo(
        () =>
            oversightConfig
                .map((group) => ({
                    ...group,
                    items: group.items.filter(
                        (item) => isLoading || !item.permissions || hasAnyPermission(item.permissions)
                    ),
                }))
                .filter((group) => group.items.length > 0),
        [isLoading, hasAnyPermission]
    );
}

function OversightLinks({ groups, onNavigate }: { groups: SettingsGroup[]; onNavigate?: () => void }) {
    const activeHref = activeSettingsHref(usePathname(), groups);
    return (
        <nav aria-label="Oversight" className="space-y-4">
            {groups.map((group) => (
                <div key={group.title} className="space-y-1">
                    <p className="flex items-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <group.icon className="mr-2 h-4 w-4" aria-hidden="true" />
                        {group.title}
                    </p>
                    {group.items.map((item) => {
                        const active = item.href === activeHref;
                        return (
                            <Button
                                key={item.href}
                                variant={active ? 'secondary' : 'ghost'}
                                size="sm"
                                asChild
                                className={cn(
                                    'h-auto min-h-8 w-full justify-start whitespace-normal py-1.5 pl-8 text-left',
                                    active && 'bg-secondary/50 font-medium text-primary shadow-sm'
                                )}
                            >
                                <Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
                                    {item.title}
                                </Link>
                            </Button>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}

export function OversightSidebar({ className }: { className?: string }) {
    const groups = useOversightGroups();
    const asideRef = useFitToMain<HTMLElement>();
    // Same scroll as the Settings menu (#1012): sticky, fitted to the visible page, native scroll bar (#1347).
    return (
        <aside
            ref={asideRef}
            data-testid="oversight-nav-scroll"
            className={cn('sticky top-0 h-[calc(100dvh-12rem)] overflow-y-auto overflow-x-hidden pr-4 pb-10 [scrollbar-width:thin]', className)}
        >
            <OversightLinks groups={groups} />
        </aside>
    );
}

export function OversightMobileNav() {
    const [open, setOpen] = React.useState(false);
    const groups = useOversightGroups();
    const pathname = usePathname();
    const currentTitle = settingsPageLabel(activeSettingsHref(pathname, groups), groups);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden w-full min-h-11 justify-between mb-4">
                    <span className="flex min-w-0 items-center">
                        <Menu className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{currentTitle ?? 'Oversight menu'}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px] overflow-y-auto p-0">
                <SheetHeader className="border-b p-4 text-left">
                    <SheetTitle>Oversight</SheetTitle>
                    <SheetDescription className="sr-only">Navigate between reports and monitoring pages.</SheetDescription>
                </SheetHeader>
                <div className="p-4">
                    <OversightLinks groups={groups} onNavigate={() => setOpen(false)} />
                </div>
            </SheetContent>
        </Sheet>
    );
}

