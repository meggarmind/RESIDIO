'use client';

import { useUserRoles } from '@/hooks/use-user-roles';
import { cn } from '@/lib/utils';
import { Home, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardContextSwitcherProps {
    className?: string;
}

export function DashboardContextSwitcher({ className }: DashboardContextSwitcherProps) {
    const { isMixedRole, mode, setMode, isLoading } = useUserRoles();

    if (isLoading || !isMixedRole) return null;

    return (
        <div className={cn("flex items-center p-1 bg-muted/50 rounded-lg border", className)}>
            <button
                onClick={() => setMode('home')}
                className={cn(
                    "relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                    mode === 'home'
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
            >
                {mode === 'home' && (
                    <motion.div
                        layoutId="active-mode-bg"
                        className="absolute inset-0 bg-primary rounded-md shadow-sm"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                )}
                <span className="relative z-10 flex items-center gap-2">
                    <Home className="w-4 h-4" />
                    My Home
                </span>
            </button>

            <button
                onClick={() => setMode('portfolio')}
                className={cn(
                    "relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                    mode === 'portfolio'
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
            >
                {mode === 'portfolio' && (
                    <motion.div
                        layoutId="active-mode-bg"
                        className="absolute inset-0 bg-primary rounded-md shadow-sm"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                )}
                <span className="relative z-10 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    My Portfolio
                </span>
            </button>
        </div>
    );
}
