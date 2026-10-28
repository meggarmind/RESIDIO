'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { activeSettingsHref, flattenSettingsNav, type SettingsGroup } from '@/config/settings-nav';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';
import { useSettingsNavState } from '@/hooks/use-settings-nav-state';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { SettingsSearchField, SettingsSearchResults, useSettingsSearch } from './settings-search';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"

type SettingsSidebarProps = React.HTMLAttributes<HTMLElement>

/** Does this group hold the page being viewed? See `activeSettingsHref`. */
function isGroupActive(activeHref: string | null, group: SettingsGroup): boolean {
    return activeHref !== null && flattenSettingsNav([group]).some((item) => item.href === activeHref);
}

export function SettingsSidebar({ className, ...props }: SettingsSidebarProps) {
    const pathname = usePathname();
    const { groups } = useSettingsNavigation();
    const activeHref = activeSettingsHref(pathname, groups);
    const activeGroupTitle = groups.find((group) => isGroupActive(activeHref, group))?.title ?? null;

    // Only groups the reader has opened or closed by hand. The group containing
    // the current page is always open, derived below rather than pushed into
    // state by an effect -- the effect version left the active group collapsed
    // on first paint, and only ever added, so every group visited stayed open.
    //
    // Held in a shared store so the mobile nav sees the same choices. See
    // `use-settings-nav-state.ts`. Passing `activeGroupTitle` lets the hook reopen a group the reader collapsed
    // once they navigate into it from outside, rather than hiding the page
    // they are looking at.
    const { userToggled, setGroupOpen } = useSettingsNavState(activeGroupTitle);
    const search = useSettingsSearch();

    const toggleGroup = (title: string, isOpen: boolean) => {
        setGroupOpen(title, !isOpen);
    };

    // Sticks inside <main>, the only scroller in the h-dvh shell. A fixed height cannot fit both states: at the
    // top of the page the aside starts below the title and its foot falls off screen. So fit it to what is
    // visible of <main> on every scroll and resize; the class height is only the first-paint fallback.
    const asideRef = React.useRef<HTMLElement>(null);
    React.useLayoutEffect(() => {
        const aside = asideRef.current;
        const main = aside?.closest('main');
        if (!aside || !main) return;
        const fit = () => {
            const visibleBottom = main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
            // Also stop at the row's foot: past it, sticky pushes the aside up and each fit would grow it again.
            const rowBottom = aside.parentElement?.getBoundingClientRect().bottom ?? visibleBottom;
            aside.style.height = `${Math.max(240, Math.min(visibleBottom, rowBottom) - aside.getBoundingClientRect().top)}px`;
        };
        fit();
        main.addEventListener('scroll', fit, { passive: true });
        window.addEventListener('resize', fit);
        return () => {
            main.removeEventListener('scroll', fit);
            window.removeEventListener('resize', fit);
        };
    }, []);

    return (
        <aside ref={asideRef} className={cn("lg:w-56 xl:w-64 sticky top-0 flex h-[calc(100dvh-12rem)] flex-col gap-3", className)} {...props}>
            <SettingsSearchField search={search} className="pr-4" />
            {/* Native overflow, not Radix ScrollArea: its scrollbar did not appear after a group expanded, so the cut-off list gave no sign it scrolls. */}
            <div data-testid="settings-nav-scroll" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-4 [scrollbar-width:thin]">
                {search.active ? (
                    <SettingsSearchResults search={search} />
                ) : (
                <nav className="space-y-4 pb-10">
                    {groups.map((group) => {
                        const isActiveGroup = isGroupActive(activeHref, group);
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
                                            "h-auto min-h-8 py-1.5 w-full justify-between whitespace-normal text-left font-semibold hover:bg-muted/50 group",
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
                                                const parentActive = item.children.some((child) => child.href === activeHref);
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
                                                            const active = child.href === activeHref;
                                                            return (
                                                                <Button
                                                                    key={child.href}
                                                                    variant={active ? "secondary" : "ghost"}
                                                                    size="sm"
                                                                    asChild
                                                                    className={cn(
                                                                        "h-auto min-h-8 py-1.5 w-full justify-start whitespace-normal text-left pl-12",
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

                                            const active = item.href === activeHref;
                                            return (
                                                <Button
                                                    key={item.href}
                                                    variant={active ? "secondary" : "ghost"}
                                                    size="sm"
                                                    asChild
                                                    className={cn(
                                                        "h-auto min-h-8 py-1.5 w-full justify-start whitespace-normal text-left pl-8",
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
                )}
            </div>
        </aside>
    );
}
