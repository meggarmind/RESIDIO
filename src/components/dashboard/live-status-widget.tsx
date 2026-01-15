'use client';

import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

interface LiveStatusWidgetProps {
    title: string;
    status: string;
    timestamp?: string;
    icon?: React.ElementType;
    className?: string;
    onClick?: () => void;
    variant?: 'default' | 'success' | 'warning' | 'error';
}

const variants = {
    default: 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800',
    success: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
};

const indicatorColors = {
    default: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
};

export function LiveStatusWidget({
    title,
    status,
    timestamp,
    icon: Icon,
    className,
    onClick,
    variant = 'default',
}: LiveStatusWidgetProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'group relative overflow-hidden rounded-lg border p-4 transition-all duration-200',
                'hover:shadow-md cursor-pointer',
                variants[variant],
                className
            )}
        >
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        {/* Pulsing Dot */}
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={cn(
                                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                                indicatorColors[variant]
                            )}></span>
                            <span className={cn(
                                'relative inline-flex rounded-full h-2.5 w-2.5',
                                indicatorColors[variant]
                            )}></span>
                        </span>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {title}
                        </p>
                    </div>
                    <h3 className="font-medium text-sm text-foreground">
                        {status}
                    </h3>
                    {timestamp && (
                        <p className="text-xs text-muted-foreground">
                            Updated {timestamp}
                        </p>
                    )}
                </div>

                {Icon && (
                    <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                        <Icon className="h-5 w-5" />
                    </div>
                )}
            </div>

            {onClick && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
            )}
        </div>
    );
}
