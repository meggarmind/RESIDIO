'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { Home, Users, CreditCard, Shield, Settings, Building2, Receipt } from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'Residents',
    href: '/residents',
    icon: Users,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
  {
    title: 'Houses',
    href: '/houses',
    icon: Building2,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
  {
    title: 'Payments',
    href: '/payments',
    icon: CreditCard,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
  {
    title: 'Billing',
    href: '/billing',
    icon: Receipt,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
  {
    title: 'Security',
    href: '/security',
    icon: Shield,
    roles: ['admin', 'chairman', 'security_officer'],
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { profile, isLoading } = useAuth();

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    // While loading, show items that the user might have access to (will be filtered properly once loaded)
    if (isLoading) return true;
    return profile?.role && item.roles.includes(profile.role);
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
                  {item.title}
                </Link>
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
            <p className="text-xs text-muted-foreground capitalize">
              {profile?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
