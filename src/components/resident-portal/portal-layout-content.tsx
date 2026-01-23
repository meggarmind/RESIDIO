'use client';

import { PortalBreadcrumb } from '@/components/resident-portal/portal-breadcrumb';
import { useLayoutTheme } from '@/contexts/layout-theme-context';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';

interface PortalLayoutContentProps {
  children: React.ReactNode;
}

/**
 * Theme-aware content wrapper for the portal layout.
 *
 * Expands container width when expanded theme is active.
 */
export function PortalLayoutContent({ children }: PortalLayoutContentProps) {
  const { isExpanded } = useLayoutTheme();

  return (
    <div
      className={cn(
        'mx-auto px-4 py-4 md:py-6 transition-[max-width] duration-300',
        // Compact: narrow containers
        'max-w-lg md:max-w-4xl lg:max-w-6xl',
        // Expanded: wider containers
        isExpanded && 'xl:max-w-7xl 2xl:max-w-[1600px]'
      )}
    >
      <PullToRefresh>
        <PortalBreadcrumb />
        {children}
      </PullToRefresh>
    </div>
  );
}
