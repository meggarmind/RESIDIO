'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    CreditCard,
    Wallet,
    UserPlus,
    Shield,
    FileText,
    Home,
    Building2,
    AlertCircle,
    Zap,
} from 'lucide-react';
import { useOS } from '@/hooks/use-os';
import { useUserRoles } from '@/hooks/use-user-roles';

interface SearchResult {
    id: string;
    title: string;
    subtitle?: string;
    href: string;
    type: 'action' | 'navigation';
    icon: React.ElementType;
}

interface ResidentGlobalSearchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Actions available in "My Home" mode
const HOME_ACTIONS: SearchResult[] = [
    {
        id: 'pay-invoice',
        title: 'Pay Invoice',
        subtitle: 'View and pay outstanding bills',
        href: '/portal/invoices',
        type: 'action',
        icon: CreditCard,
    },
    {
        id: 'top-up',
        title: 'Top Up Wallet',
        subtitle: 'Add funds to your wallet',
        href: '/portal/wallet', // In future: ?action=topup
        type: 'action',
        icon: Wallet,
    },
    {
        id: 'visitor',
        title: 'Register Visitor',
        subtitle: 'Grant access to a guest',
        href: '/portal/visitors', // In future: ?action=new
        type: 'action',
        icon: UserPlus,
    },
    {
        id: 'security',
        title: 'Emergency Contacts',
        subtitle: 'View security contacts',
        href: '/portal/security-contacts',
        type: 'navigation',
        icon: Shield,
    },
];

// Actions available in "My Portfolio" mode
const PORTFOLIO_ACTIONS: SearchResult[] = [
    {
        id: 'portfolio-overview',
        title: 'Portfolio Overview',
        subtitle: 'View all owned properties',
        href: '/portal?mode=portfolio',
        type: 'navigation',
        icon: Building2,
    },
    {
        id: 'compliance',
        title: 'Compliance Report',
        subtitle: 'Check levy status across units',
        href: '/portal/compliance',
        type: 'action',
        icon: FileText,
    },
    {
        id: 'maintenance',
        title: 'Log Maintenance',
        subtitle: 'Report an issue for a tenant',
        href: '/portal/maintenance/new',
        type: 'action',
        icon: AlertCircle,
    },
    {
        id: 'bulk-pay',
        title: 'Bulk Pay Levies',
        subtitle: 'Pay for multiple units at once',
        href: '/portal/payments/bulk',
        type: 'action',
        icon: Wallet,
    },
];

// Common Navigation Items (Always available)
const COMMON_NAV: SearchResult[] = [
    {
        id: 'home',
        title: 'Dashboard',
        href: '/portal',
        type: 'navigation',
        icon: Home,
    },
    {
        id: 'documents',
        title: 'My Documents',
        href: '/portal/documents',
        type: 'navigation',
        icon: FileText,
    },
];

export function ResidentGlobalSearch({ open, onOpenChange }: ResidentGlobalSearchProps) {
    const router = useRouter();
    const os = useOS();
    const { mode } = useUserRoles();
    const [query, setQuery] = useState('');

    // Determine available actions based on mode
    const contextActions = mode === 'portfolio' ? PORTFOLIO_ACTIONS : HOME_ACTIONS;

    // Clean query for filtering
    const cleanQuery = query.toLowerCase().trim();

    // Filter actions
    const filteredActions = [...contextActions, ...COMMON_NAV].filter(item =>
        !cleanQuery ||
        item.title.toLowerCase().includes(cleanQuery) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(cleanQuery))
    );

    const handleSelect = useCallback(
        (href: string) => {
            onOpenChange(false);
            setQuery('');
            router.push(href);
        },
        [router, onOpenChange]
    );

    // Keyboard Shortcut: Cmd+K
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onOpenChange(!open);
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [open, onOpenChange]);

    const shortcutKey = os === 'mac' ? '⌘' : 'Ctrl';

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput
                placeholder={`Search ${mode === 'portfolio' ? 'portfolio' : 'home'} actions...`}
                value={query}
                onValueChange={setQuery}
                className="border-none focus:ring-0"
            />
            <CommandList className="max-h-[400px]">
                <CommandEmpty>No results found.</CommandEmpty>

                {filteredActions.length > 0 && (
                    <CommandGroup heading="Suggested Actions">
                        {filteredActions.map((item) => {
                            const Icon = item.icon;
                            return (
                                <CommandItem
                                    key={item.id}
                                    value={`${item.title} ${item.subtitle || ''}`}
                                    onSelect={() => handleSelect(item.href)}
                                    className="cursor-pointer"
                                >
                                    <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
                                    <div className="flex flex-col flex-1">
                                        <span className="font-medium">{item.title}</span>
                                        {item.subtitle && (
                                            <span className="text-xs text-muted-foreground">
                                                {item.subtitle}
                                            </span>
                                        )}
                                    </div>
                                    {item.type === 'action' && <Zap className="h-3 w-3 text-muted-foreground/50" />}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                )}
            </CommandList>

            <div className="border-t px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
                <span>Navigate with ↑↓ arrows, select with Enter</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    <span className="min-w-[12px] text-center">{shortcutKey}</span>K
                </kbd>
            </div>
        </CommandDialog>
    );
}
