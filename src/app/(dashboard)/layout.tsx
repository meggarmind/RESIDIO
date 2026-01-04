'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { VisualThemeProvider } from '@/contexts/visual-theme-context';
import { useEffectiveTheme } from '@/hooks/use-theme-preferences';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile Navigation */}
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
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
    <VisualThemeProvider context="admin-dashboard" initialThemeId={effectiveTheme || 'nahid'}>
      <DashboardContent>{children}</DashboardContent>
    </VisualThemeProvider>
  );
}
