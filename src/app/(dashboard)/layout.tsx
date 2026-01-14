'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { ModernSidebar } from '@/components/dashboard/modern-sidebar';
import { Header } from '@/components/dashboard/header';
import { ModernHeader } from '@/components/dashboard/modern-header';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { AdminBreadcrumb } from '@/components/dashboard/admin-breadcrumb';
import { VisualThemeProvider, useVisualTheme } from '@/contexts/visual-theme-context';
import { useEffectiveTheme } from '@/hooks/use-theme-preferences';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { themeId } = useVisualTheme();

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar - Conditional rendering based on active theme */}
      {themeId === 'modern' ? (
        <ModernSidebar className="hidden md:flex" />
      ) : (
        <Sidebar className="hidden md:flex" />
      )}

      {/* Mobile Navigation */}
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header - Conditional rendering based on active theme */}
        {themeId === 'modern' ? (
          <ModernHeader onMenuClick={() => setMobileNavOpen(true)} />
        ) : (
          <Header onMenuClick={() => setMobileNavOpen(true)} />
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: effectiveTheme } = useEffectiveTheme('admin-dashboard');

  return (
    <VisualThemeProvider context="admin-dashboard" initialThemeId={effectiveTheme || 'default'}>
      <DashboardContent>{children}</DashboardContent>
    </VisualThemeProvider>
  );
}
