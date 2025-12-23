import { PortalHeader } from '@/components/resident-portal/portal-header';
import { PortalBottomNav } from '@/components/resident-portal/portal-bottom-nav';

export const metadata = {
  title: 'Resident Portal | Residio',
  description: 'Access your resident portal to view invoices, payments, and manage security contacts',
};

/**
 * Resident Portal Layout
 *
 * A mobile-first layout for the resident self-service portal.
 * Features:
 * - Fixed header (56px) with branding and user menu
 * - Scrollable main content area
 * - Fixed bottom navigation (64px + safe area)
 * - Dark mode support via existing theme
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

      {/* Fixed Header */}
      <PortalHeader />

      {/* Main Content Area */}
      <main
        className="pt-14 pb-20 min-h-screen"
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="max-w-lg mx-auto px-4 py-4">
          {children}
        </div>
      </main>

      {/* Fixed Bottom Navigation */}
      <PortalBottomNav />
    </div>
  );
}
