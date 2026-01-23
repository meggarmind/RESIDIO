'use client';

import { VisualThemeProvider } from '@/contexts/visual-theme-context';
import { useEffectiveTheme } from '@/hooks/use-theme-preferences';

export function DashboardProviders({ children }: { children: React.ReactNode }) {
    const { data: effectiveTheme } = useEffectiveTheme('admin-dashboard');

    return (
        <VisualThemeProvider context="admin-dashboard" initialThemeId={effectiveTheme || 'default'}>
            {children}
        </VisualThemeProvider>
    );
}
