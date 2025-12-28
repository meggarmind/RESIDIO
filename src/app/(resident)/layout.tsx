import { PortalHeader } from '@/components/resident-portal/portal-header';
import { PortalBottomNav } from '@/components/resident-portal/portal-bottom-nav';
import { PortalSidebar } from '@/components/resident-portal/portal-sidebar';
import { PortalBreadcrumb } from '@/components/resident-portal/portal-breadcrumb';

export const metadata = {
  title: 'Resident Portal | Residio',
  description: 'Access your resident portal to view invoices, payments, and manage security contacts',
};

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
export default function ResidentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Subtle background pattern for depth */}
      <div
        className="fixed inset-0 -z-10 opacity-[0.015] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Desktop: Sidebar (hidden on mobile) */}
      <PortalSidebar className="hidden md:flex" />

      {/* Mobile: Fixed Header (hidden on desktop) */}
      <div className="md:hidden">
        <PortalHeader />
      </div>

      {/* Main Content Area */}
      <main
        className="
          pt-14 pb-20 min-h-screen
          md:pt-0 md:pb-0 md:ml-64
        "
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Responsive container: narrow on mobile, wider on desktop */}
        <div className="max-w-lg mx-auto px-4 py-4 md:max-w-4xl md:py-6 lg:max-w-6xl">
          <PortalBreadcrumb />
          {children}
        </div>
      </main>

      {/* Mobile: Fixed Bottom Navigation (hidden on desktop) */}
      <div className="md:hidden">
        <PortalBottomNav />
      </div>
    </div>
  );
}
