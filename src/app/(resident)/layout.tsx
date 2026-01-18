'use client';

import { PortalHeader } from '@/components/resident-portal/portal-header';
import { PortalBottomNav } from '@/components/resident-portal/portal-bottom-nav';
import { PortalSidebar } from '@/components/resident-portal/portal-sidebar';
import { ImpersonationPortalWrapper } from '@/components/resident-portal/impersonation-portal-wrapper';
import { OnboardingCheck } from '@/components/resident-portal/onboarding-check';
import { VisualThemeProvider } from '@/contexts/visual-theme-context';

/**
 * Resident Portal Layout - Modern Design System
 *
 * A minimalist, card-based responsive layout following the portal-modern design system.
 *
 * Layout Structure:
 * Desktop (lg+):
 * - Grid: 80px sidebar | main content (flex) | 280px right sidebar (optional)
 * - Fixed header: 64px height
 * - Icon-only left sidebar: 80px width
 * - Right sidebar: Context-specific (stats, calendar, activity)
 *
 * Tablet (md - lg):
 * - Grid: 80px sidebar | main content (flex)
 * - Right sidebar hidden (can be shown in modal)
 * - Icon-only left sidebar: 80px width
 *
 * Mobile (< md):
 * - Stacked layout (no sidebars)
 * - Fixed header: 64px height
 * - Fixed bottom navigation: 64px height
 * - Single column content
 *
 * Design Tokens:
 * - Page background: var(--color-bg-page) - #F5F7FA
 * - Card background: var(--color-bg-card) - #FFFFFF
 * - Header height: var(--header-height) - 64px
 * - Sidebar width: var(--sidebar-width) - 80px
 * - Right sidebar width: var(--sidebar-right-width) - 280px
 */

function PortalContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen transition-colors duration-300"
      style={{
        background: 'var(--color-bg-page)',
        fontFamily: 'var(--font-family-primary)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Desktop & Tablet Sidebar - Part of flex flow, pushes content */}
      <PortalSidebar className="hidden md:flex" />

      {/* Main Layout - Uses flex-1 to take remaining space */}
      <div className="flex flex-1 flex-col min-h-screen">
        {/* Fixed Header - 64px height */}
        <PortalHeader />

        {/* Main Content Area */}
        <main className="flex-1 overflow-x-hidden">
          {/* Content Container with Design System Spacing */}
          <div
            className="mx-auto px-6 py-6 space-y-8"
            style={{
              maxWidth: 'var(--container-2xl)', // 1440px
            }}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (< md) */}
      <PortalBottomNav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          height: 'var(--bottom-nav-height)',
          background: 'var(--color-bg-card)',
          borderTop: '1px solid var(--color-bg-input)',
        }}
      />
    </div>
  );
}

export default function ResidentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VisualThemeProvider context="resident-portal">
      <ImpersonationPortalWrapper>
        <OnboardingCheck>
          <PortalContent>{children}</PortalContent>
        </OnboardingCheck>
      </ImpersonationPortalWrapper>
    </VisualThemeProvider>
  );
}
