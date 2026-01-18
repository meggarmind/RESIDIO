'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    UserPlus,
    CreditCard,
    FileText,
    Upload,
    Home,
    Receipt,
    Zap,
    Users,
    ShieldPlus,
    Settings
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface QuickAction {
    label: string;
    description: string;
    href: string;
    icon: React.ElementType;
    color: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'slate';
}

interface QuickActionsPanelProps {
    compact?: boolean;
}

const quickActions: QuickAction[] = [
    {
        label: 'Add Resident',
        description: 'Register resident',
        href: '/residents/new',
        icon: UserPlus,
        color: 'emerald',
    },
    {
        label: 'Record Payment',
        description: 'Payment entry',
        href: '/payments/new',
        icon: CreditCard,
        color: 'blue',
    },
    {
        label: 'Generate Invoices',
        description: 'New invoices',
        href: '/billing/generate',
        icon: FileText,
        color: 'amber',
    },
    {
        label: 'Import Statement',
        description: 'Statement upload',
        href: '/billing/imports/new',
        icon: Upload,
        color: 'purple',
    },
    {
        label: 'Add House',
        description: 'Register property',
        href: '/houses/new',
        icon: Home,
        color: 'rose',
    },
    {
        label: 'Security Contact',
        description: 'Register contact',
        href: '/security/contacts/new',
        icon: ShieldPlus,
        color: 'slate',
    },
];

const colorStyles = {
    emerald: {
        bg: 'bg-emerald-500/10 group-hover:bg-emerald-500/20',
        icon: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-500/20 group-hover:border-emerald-500/40',
    },
    blue: {
        bg: 'bg-blue-500/10 group-hover:bg-blue-500/20',
        icon: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-500/20 group-hover:border-blue-500/40',
    },
    amber: {
        bg: 'bg-amber-500/10 group-hover:bg-amber-500/20',
        icon: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/20 group-hover:border-amber-500/40',
    },
    purple: {
        bg: 'bg-purple-500/10 group-hover:bg-purple-500/20',
        icon: 'text-purple-600 dark:text-purple-400',
        border: 'border-purple-500/20 group-hover:border-purple-500/40',
    },
    rose: {
        bg: 'bg-rose-500/10 group-hover:bg-rose-500/20',
        icon: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-500/20 group-hover:border-rose-500/40',
    },
    slate: {
        bg: 'bg-slate-500/10 group-hover:bg-slate-500/20',
        icon: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-500/20 group-hover:border-slate-500/40',
    },
};

function QuickActionButton({ action, compact }: { action: QuickAction; compact?: boolean }) {
    const styles = colorStyles[action.color];
    const Icon = action.icon;

    return (
        <Link href={action.href} className="group">
            <div className={cn(
                'flex items-center gap-3 rounded-lg border transition-all duration-200',
                'hover:shadow-md hover:translate-y-[-2px]',
                compact ? "p-2" : "p-3",
                styles.bg,
                styles.border
            )}>
                <div className={cn(
                    'p-2 rounded-lg shrink-0 transition-transform duration-200 group-hover:scale-110',
                    styles.bg
                )}>
                    <Icon className={cn('h-4 w-4', styles.icon)} />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{action.label}</p>
                    {!compact && (
                        <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                    )}
                </div>
            </div>
        </Link>
    );
}

export function QuickActionsPanel({ compact }: QuickActionsPanelProps) {
    return (
        <Card className={cn("animate-fade-in-up h-full", compact ? "border-none shadow-none bg-transparent" : "")}>
            <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Zap className="h-5 w-5 text-amber-500" />
                    {compact ? "Actions" : "Quick Actions"}
                </CardTitle>
            </CardHeader>
            <CardContent className={compact ? "p-4 pt-0" : ""}>
                <div className={cn(
                    "grid gap-2",
                    compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                )}>
                    {quickActions.map((action) => (
                        <QuickActionButton key={action.href} action={action} compact={compact} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
