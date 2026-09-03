'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isIndexChild, type SettingsGroup, type SettingsItem } from '@/config/settings-nav';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';
import { useSettingsNavState } from '@/hooks/use-settings-nav-state';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

/** Index entries match exactly; see the note in settings-sidebar.tsx. */
function isItemActive(pathname: string, item: SettingsItem, parent?: SettingsItem): boolean {
    if (parent && isIndexChild(parent, item)) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
}

function isGroupActive(pathname: string, group: SettingsGroup): boolean {
    return group.items.some((item) =>
        item.children
            ? item.children.some((child) => isItemActive(pathname, child, item))
            : isItemActive(pathname, item)
    );
}

export function SettingsMobileNav() {
    const pathname = usePathname();
    const [open, setOpen] = React.useState(false);
    const { groups } = useSettingsNavigation();
    const activeGroupTitle = groups.find((g) => isGroupActive(pathname, g))?.title ?? null;

    // Same store as the desktop sidebar (`settings-sidebar.tsx`), so opening
    // or collapsing a group on one surface is reflected on the other, and
    // more than one group can be open at once here too — this used to be a
    // strict single-open accordion driven by local `overrideGroup` state,
    // which disagreed with desktop's "many groups open" model. See
    // `use-settings-nav-state.ts` for why this lives outside React (the root
    // `app/template.tsx` remounts this component on every navigation) and for
    // the reopen-on-entry rule `activeGroupTitle` feeds.
    const { userToggled, setGroupOpen } = useSettingsNavState(activeGroupTitle);

    const toggleGroup = (title: string, isOpen: boolean) => {
        setGroupOpen(title, !isOpen);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden w-full justify-between mb-4">
                    <span className="flex items-center">
                        <Menu className="mr-2 h-4 w-4" />
                        Settings Menu
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px] p-0">
                <SheetHeader className="p-4 border-b text-left">
                    <SheetTitle>Settings</SheetTitle>
                    <SheetDescription className="sr-only">
                        Navigate between administration settings areas.
                    </SheetDescription>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-5rem)]">
                    <div className="flex flex-col p-4 space-y-4">
                        {groups.map((group) => {
                            const isActiveGroup = isGroupActive(pathname, group);
                            // The active group stays open unless the reader closes it —
                            // same fallback as desktop's `isOpen` in settings-sidebar.tsx.
                            const isExpanded = userToggled[group.title] ?? isActiveGroup;

                            return (
                                <div key={group.title} className="space-y-1">
                                    <button
                                        onClick={() => toggleGroup(group.title, isExpanded)}
                                        className={cn(
                                            "flex items-center justify-between w-full p-2 text-sm font-medium rounded-md transition-colors hover:bg-muted/50",
                                            isActiveGroup && !isExpanded && "bg-muted/30 text-primary"
                                        )}
                                    >
                                        <div className="flex items-center">
                                            <div className={cn(
                                                "p-1.5 rounded-md mr-3 transition-colors",
                                                isActiveGroup ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                            )}>
                                                <group.icon className="h-4 w-4" />
                                            </div>
                                            <span className={cn(isActiveGroup && "text-primary")}>
                                                {group.title}
                                            </span>
                                        </div>
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </button>

                                    {isExpanded && (
                                        <div className="ml-11 space-y-1 border-l pl-2 animate-in slide-in-from-top-2 duration-200">
                                            {group.items.map((item) => {
                                                if (item.children) {
                                                    const parentActive = item.children.some(child => isItemActive(pathname, child, item));
                                                    return (
                                                        <div key={item.href} className="space-y-1">
                                                            <span className={cn(
                                                                "block px-2 py-1.5 text-sm font-medium rounded-md",
                                                                parentActive ? "text-primary" : "text-muted-foreground"
                                                            )}>
                                                                {item.title}
                                                            </span>
                                                            <div className="space-y-1">
                                                                {item.children.map((child) => {
                                                                    const active = isItemActive(pathname, child, item);
                                                                    return (
                                                                        <Link
                                                                            key={child.href}
                                                                            href={child.href}
                                                                            onClick={() => setOpen(false)}
                                                                            aria-current={active ? 'page' : undefined}
                                                                            className={cn(
                                                                                "block px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-muted/50 hover:text-primary",
                                                                                active
                                                                                    ? "bg-primary/5 font-medium text-primary"
                                                                                    : "text-muted-foreground"
                                                                            )}
                                                                        >
                                                                            {child.title}
                                                                        </Link>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={() => setOpen(false)}
                                                        className={cn(
                                                            "block px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-muted/50 hover:text-primary",
                                                            pathname === item.href
                                                                ? "bg-primary/5 font-medium text-primary"
                                                                : "text-muted-foreground"
                                                        )}
                                                    >
                                                        {item.title}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
