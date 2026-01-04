'use client';

import { PortalTopBar } from '@/components/resident-portal/portal-topbar';
import { PortalBottomNav } from '@/components/resident-portal/portal-bottom-nav';
import { PortalSidebar } from '@/components/resident-portal/portal-sidebar';
import { VisualThemeProvider } from '@/contexts/visual-theme-context';
import { useEffectiveTheme } from '@/hooks/use-theme-preferences';

/**
 * Resident Portal Layout
 *
 * A responsive layout for the resident self-service portal.
 *
 * Mobile (< md):
 * - Fixed header (56px) with branding and user menu
 * - Scrollable main content area (max-w-lg)
 * - Fixed bottom navigation (64px + safe area)
 *
 * Desktop (md+):
 * - Fixed sidebar (256px) with navigation
 * - Full-width content area (max-w-4xl)
 * - No bottom navigation
 */

function PortalContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bill-bg font-sans text-bill-text transition-colors duration-300">
      {/* Desktop Sidebar */}
      <PortalSidebar className="hidden md:flex" />

      {/* Main Content Wrapper */}
      <div className="md:pl-[180px] flex flex-col min-h-screen">
        {/* Top Bar */}
        <PortalTopBar />

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <PortalBottomNav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bill-card" />
    </div>
  );
}

export default function ResidentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: effectiveTheme } = useEffectiveTheme('resident-portal');

  return (
    <VisualThemeProvider context="resident-portal" initialThemeId={effectiveTheme || 'nahid'}>
      <PortalContent>{children}</PortalContent>
    </VisualThemeProvider>
  );
}
