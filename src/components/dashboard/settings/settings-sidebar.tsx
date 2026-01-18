'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { settingsConfig } from '@/config/settings-nav';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface SettingsSidebarProps extends React.HTMLAttributes<HTMLElement> { }

export function SettingsSidebar({ className, ...props }: SettingsSidebarProps) {
    const pathname = usePathname();
    // State to track open groups
    const [openGroups, setOpenGroups] = React.useState<string[]>([]);

    React.useEffect(() => {
        // Find group containing current path and ensure it's open
        const activeGroup = settingsConfig.find(g =>
            g.items.some(item => item.href === pathname)
        );
        if (activeGroup) {
            setOpenGroups(prev => {
                if (prev.includes(activeGroup.title)) return prev;
                return [...prev, activeGroup.title];
            });
        }
    }, [pathname]);

    const toggleGroup = (title: string) => {
        setOpenGroups(prev =>
            prev.includes(title)
                ? prev.filter(t => t !== title)
                : [...prev, title]
        );
    };

    return (
        <aside className={cn("lg:w-1/5 sticky top-8 h-[calc(100vh-8rem)]", className)} {...props}>
            <ScrollArea className="h-full pr-4">
                <nav className="space-y-4 pb-10">
                    {settingsConfig.map((group) => {
                        const isOpen = openGroups.includes(group.title);
                        const isActiveGroup = group.items.some(item => item.href === pathname);

                        return (
                            <Collapsible
                                key={group.title}
                                open={isOpen}
                                onOpenChange={() => toggleGroup(group.title)}
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
                                        {group.items.map((item) => (
                                            <Button
                                                key={item.href}
                                                variant={pathname === item.href ? "secondary" : "ghost"}
                                                size="sm"
                                                asChild
                                                className={cn(
                                                    "w-full justify-start pl-8 h-8",
                                                    pathname === item.href && "bg-secondary/50 font-medium text-primary shadow-sm"
                                                )}
                                            >
                                                <Link href={item.href}>
                                                    {item.title}
                                                </Link>
                                            </Button>
                                        ))}
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
