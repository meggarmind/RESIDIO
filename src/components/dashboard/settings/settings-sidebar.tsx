'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isIndexChild, type SettingsGroup, type SettingsItem } from '@/config/settings-nav';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';
import { useSettingsNavState } from '@/hooks/use-settings-nav-state';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"

type SettingsSidebarProps = React.HTMLAttributes<HTMLElement>

/**
 * Is this the page being viewed?
 *
 * An index entry — one whose href is its parent's — has to match exactly.
 * Matching on prefix made every ancestor look selected: on
 * /settings/security/categories both "Security Settings" and "Contact
 * Categories" lit up, and "Overview" was highlighted on every settings page.
 */
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

export function SettingsSidebar({ className, ...props }: SettingsSidebarProps) {
    const pathname = usePathname();
    const { groups } = useSettingsNavigation();

    // Only groups the reader has opened or closed by hand. The group containing
    // the current page is always open, derived below rather than pushed into
    // state by an effect -- the effect version left the active group collapsed
    // on first paint, and only ever added, so every group visited stayed open.
    //
    // Held outside React because the root `app/template.tsx` remounts this
    // component on every navigation; as component state the reader's choice
    // did not survive a single click. See `use-settings-nav-state.ts`.
    const { userToggled, setGroupOpen } = useSettingsNavState();

    const toggleGroup = (title: string, isOpen: boolean) => {
        setGroupOpen(title, !isOpen);
    };

    return (
        <aside className={cn("lg:w-1/5 sticky top-8 h-[calc(100vh-8rem)]", className)} {...props}>
            <ScrollArea className="h-full pr-4">
                <nav className="space-y-4 pb-10">
                    {groups.map((group) => {
                        const isActiveGroup = isGroupActive(pathname, group);
                        // The active group stays open unless the reader closes it.
                        const isOpen = userToggled[group.title] ?? isActiveGroup;

                        return (
                            <Collapsible
                                key={group.title}
                                open={isOpen}
                                onOpenChange={() => toggleGroup(group.title, isOpen)}
                                className="space-y-1"
                            >
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "w-full justify-between font-semibold hover:bg-muted/50 group",
                                            isActiveGroup ? "text-primary" : "text-muted-foreground"
                                        )}
                                    >
                                        <span className="flex items-center">
                                            <group.icon className={cn(
                                                "mr-2 h-4 w-4 transition-colors",
                                                isActiveGroup ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                            )} />
                                            <span className="text-xs uppercase tracking-wider">{group.title}</span>
                                        </span>
                                        {isOpen ? (
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 opacity-50" />
                                        )}
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-1 animate-collapsible-slide-down">
                                    <div className="pt-1 space-y-1">
                                        {group.items.map((item) => {
                                            if (item.children) {
                                                const parentActive = item.children.some((child) =>
                                                    isItemActive(pathname, child, item)
                                                );
                                                return (
                                                    <div key={item.href} className="space-y-1">
                                                        <p
                                                            className={cn(
                                                                "px-3 pl-8 py-1.5 text-sm font-medium",
                                                                parentActive ? "text-primary" : "text-muted-foreground"
                                                            )}
                                                        >
                                                            {item.title}
                                                        </p>
                                                        {item.children.map((child) => {
                                                            const active = isItemActive(pathname, child, item);
                                                            return (
                                                                <Button
                                                                    key={child.href}
                                                                    variant={active ? "secondary" : "ghost"}
                                                                    size="sm"
                                                                    asChild
                                                                    className={cn(
                                                                        "w-full justify-start pl-12 h-8",
                                                                        active && "bg-secondary/50 font-medium text-primary shadow-sm"
                                                                    )}
                                                                >
                                                                    <Link href={child.href} aria-current={active ? 'page' : undefined}>
                                                                        {child.title}
                                                                    </Link>
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }

                                            const active = isItemActive(pathname, item);
                                            return (
                                                <Button
                                                    key={item.href}
                                                    variant={active ? "secondary" : "ghost"}
                                                    size="sm"
                                                    asChild
                                                    className={cn(
                                                        "w-full justify-start pl-8 h-8",
                                                        active && "bg-secondary/50 font-medium text-primary shadow-sm"
                                                    )}
                                                >
                                                    <Link href={item.href} aria-current={active ? 'page' : undefined}>
                                                        {item.title}
                                                    </Link>
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )
                    })}
                </nav>
            </ScrollArea>
        </aside>
    );
}
