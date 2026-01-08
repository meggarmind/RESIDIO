'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  Building,
  UserPlus,
  Wallet,
  Receipt,
  Shield,
  FileText,
  Megaphone,
  User,
  Hexagon
} from 'lucide-react';
import { useEstateLogo } from '@/hooks/use-estate-logo';

interface PortalSidebarProps {
  className?: string;
}

export function PortalSidebar({ className }: PortalSidebarProps) {
  const pathname = usePathname();
  const { logoUrl } = useEstateLogo();

  const navItems = [
    { href: '/portal', label: 'Dashboard', icon: Home },
    { href: '/portal/properties', label: 'My Properties', icon: Building },
    { href: '/portal/visitors', label: 'Visitors', icon: UserPlus },
    { href: '/portal/wallet', label: 'Wallet', icon: Wallet },
    { href: '/portal/invoices', label: 'Invoices', icon: Receipt },
    { href: '/portal/security-contacts', label: 'Security Contacts', icon: Shield },
    { href: '/portal/documents', label: 'Documents', icon: FileText },
    { href: '/portal/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/portal/profile', label: 'Profile', icon: User },
  ];

  return (
    <aside className={cn(
      "w-[180px] bg-bill-sidebar border-r border-border fixed inset-y-0 left-0 z-30 flex flex-col py-6 px-4 transition-colors duration-300 hidden md:flex",
      className
    )}>
      {/* Logo Section */}
      <div className="flex items-center gap-2 mb-8 px-2">
        {logoUrl ? (
          /* Dynamic estate logo */
          <img
            src={logoUrl}
            alt="Estate Logo"
            className="h-8 w-auto max-w-[140px] object-contain"
          />
        ) : (
          /* Fallback: Default Bill branding */
          <>
            <Hexagon className="h-6 w-6 text-bill-text fill-current" />
            <span className="text-2xl font-bold text-bill-text tracking-tight">Bill</span>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/portal'
            ? pathname === '/portal'
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-bill-text text-bill-card shadow-sm" // Active: Dark bg (text color), Light text (card color) 
                  : "text-bill-text-secondary hover:bg-bill-secondary hover:text-bill-text"
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", isActive ? "text-current" : "text-bill-text-secondary group-hover:text-bill-text")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-2">
        <p className="text-[11px] text-bill-text-secondary">
          © 2023 All Rights Reserved.
        </p>
      </div>
    </aside>
  );
}
