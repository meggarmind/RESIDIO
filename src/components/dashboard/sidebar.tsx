'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { Home, Users, CreditCard, Shield, Settings, Building2, Receipt, ClipboardCheck, Upload, FileBarChart } from 'lucide-react';
import { usePendingApprovalsCount } from '@/hooks/use-approvals';
import { Badge } from '@/components/ui/badge';
import { PERMISSIONS } from '@/lib/auth/action-roles';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions?: string[]; // New: required permissions (user needs at least one)
  roles?: string[]; // Legacy: kept for backwards compat
  showBadge?: boolean;
  children?: NavItem[]; // Nested navigation items
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    // All authenticated users
  },
  {
    title: 'Residents',
    href: '/residents',
    icon: Users,
    permissions: [PERMISSIONS.RESIDENTS_VIEW],
  },
  {
    title: 'Houses',
    href: '/houses',
    icon: Building2,
    permissions: [PERMISSIONS.HOUSES_VIEW],
  },
  {
    title: 'Payments',
    href: '/payments',
    icon: CreditCard,
    permissions: [PERMISSIONS.PAYMENTS_VIEW],
    children: [
      {
        title: 'Import Statement',
        href: '/payments/import',
        icon: Upload,
        permissions: [PERMISSIONS.IMPORTS_CREATE],
      },
    ],
  },
  {
    title: 'Billing',
    href: '/billing',
    icon: Receipt,
    permissions: [PERMISSIONS.BILLING_VIEW],
  },
  {
    title: 'Security',
    href: '/security',
    icon: Shield,
    permissions: [PERMISSIONS.SECURITY_VIEW],
  },
  {
    title: 'Reports',
    href: '/reports/financial-overview',
    icon: FileBarChart,
    permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL, PERMISSIONS.REPORTS_VIEW_OCCUPANCY, PERMISSIONS.REPORTS_VIEW_SECURITY],
  },
  {
    title: 'Approvals',
    href: '/approvals',
    icon: ClipboardCheck,
    permissions: [PERMISSIONS.APPROVALS_VIEW],
    showBadge: true,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    permissions: [PERMISSIONS.SETTINGS_VIEW],
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { profile, isLoading, hasAnyPermission } = useAuth();
  const { data: pendingCount } = usePendingApprovalsCount();

  const filteredNavItems = navItems.filter((item) => {
    // No permissions required = visible to all
    if (!item.permissions) return true;
    // While loading, show items that the user might have access to (will be filtered properly once loaded)
    if (isLoading) return true;
    // Check if user has any of the required permissions
    return hasAnyPermission(item.permissions);
  });

  return (
    <aside className={cn('flex flex-col w-64 border-r bg-card', className)}>
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            R
          </div>
          <span className="text-xl font-bold">Residio</span>
        </Link>
      </div>
      <nav className="flex-1 px-4 pb-4">
        <ul className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showBadgeCount = item.showBadge && pendingCount && pendingCount > 0;

            // Filter children based on permissions
            const filteredChildren = item.children?.filter((child) => {
              if (!child.permissions) return true;
              if (isLoading) return true;
              return hasAnyPermission(child.permissions);
            });

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.title}</span>
                  {showBadgeCount && (
                    <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                      {pendingCount}
                    </Badge>
                  )}
                </Link>
                {/* Render nested children with indent */}
                {filteredChildren && filteredChildren.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {filteredChildren.map((child) => {
                      const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 pl-9 text-sm font-medium transition-colors',
                              isChildActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <child.icon className="h-4 w-4" />
                            <span className="flex-1">{child.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {profile?.full_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {profile?.role_display_name || profile?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
