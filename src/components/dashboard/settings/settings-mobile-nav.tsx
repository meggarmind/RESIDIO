'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { settingsConfig } from '@/config/settings-nav';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

export function SettingsMobileNav() {
    const pathname = usePathname();
    const [open, setOpen] = React.useState(false);
    const [expandedGroup, setExpandedGroup] = React.useState<string | null>(null);

    // Auto-expand the group containing the current page
    React.useEffect(() => {
        if (open) {
            const currentGroup = settingsConfig.find(g =>
                g.items.some(item => item.href === pathname)
            );
            if (currentGroup) {
                setExpandedGroup(currentGroup.title);
            }
        }
    }, [open, pathname]);

    const toggleGroup = (title: string) => {
        setExpandedGroup(expandedGroup === title ? null : title);
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
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-5rem)]">
                    <div className="flex flex-col p-4 space-y-4">
                        {settingsConfig.map((group) => {
                            const isExpanded = expandedGroup === group.title;
                            const isActiveGroup = group.items.some(item => item.href === pathname);

                            return (
                                <div key={group.title} className="space-y-1">
                                    <button
                                        onClick={() => toggleGroup(group.title)}
                                        className={cn(
                                            "flex items-center justify-between w-full p-2 text-sm font-medium rounded-md transition-colors hover:bg-muted/50",
                                            isActiveGroup && !isExpanded && "bg-muted/30 text-primary" // Highlight closed active group
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
                                            {group.items.map((item) => (
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
                                            ))}
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
