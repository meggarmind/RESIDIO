'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Home, CreditCard, Shield, User, LayoutDashboard, FileText } from 'lucide-react';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/invoices', label: 'Payments', icon: CreditCard },
  { href: '/portal/security-contacts', label: 'Security Contacts', icon: Shield },
  { href: '/portal/documents', label: 'Documents', icon: FileText },
  { href: '/portal/profile', label: 'Profile', icon: User },
];

interface PortalSidebarProps {
  className?: string;
}

/**
 * Portal Sidebar Component
 *
 * Desktop sidebar for the resident portal with:
 * - Estate branding
 * - Portal navigation items
 * - Admin Dashboard link (if user has permissions)
 * - Theme switcher
 * - User info
 */
export function PortalSidebar({ className }: PortalSidebarProps) {
  const pathname = usePathname();
  const { profile, hasAnyPermission } = useAuth();

  // Check if user has admin dashboard access (any admin permission indicates dashboard access)
  const hasAdminAccess = hasAnyPermission([PERMISSIONS.RESIDENTS_VIEW]);

  // Check if a nav item is active
  const isActive = (href: string) => {
    if (href === '/portal') {
      return pathname === '/portal';
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className={cn('fixed left-0 top-0 h-full w-64 flex flex-col border-r bg-card', className)}>
      {/* Logo / Branding */}
      <div className="p-6">
        <Link href="/portal" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-xl font-bold">Residio</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 pb-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t p-4 space-y-3">
        <ThemeSwitcher />

        {/* Admin Dashboard link - only shown if user has admin permissions */}
        {hasAdminAccess && (
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Admin Dashboard</span>
          </Link>
        )}

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
            {profile?.full_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">Resident</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
